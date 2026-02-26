---
title: "feat: Swiss Draw Generation + Knockout Brackets"
type: feat
status: active
date: 2026-02-21
---

# Swiss Draw Generation + Knockout Brackets (Phase 3)

## Overview

Complete the Swiss tournament lifecycle: generate draws, play rounds, calculate standings, pair subsequent rounds based on scores, and advance top qualifiers to a single-elimination knockout bracket. This is the core tournament execution loop that makes the platform functional.

**Scope**: Swiss format only. Mexicano and Groups+Knockout are deferred to a later phase.

## Problem Statement

Currently the system can generate Swiss Round 1 pairings and assign matches to courts, but the tournament cannot progress beyond that. There is no way to:
- Record match results (start/complete matches)
- Calculate standings from completed matches
- Generate subsequent Swiss rounds based on standings
- Transition qualifiers to a knockout bracket
- Track the tournament's progression through phases

The TD is stuck after Round 1 assignment — the core tournament loop is broken.

## Proposed Solution

Build the complete Swiss → Knockout pipeline in 6 implementation steps, each building on the previous:

1. **Schema updates** — Add missing columns and fix TypeScript types
2. **Match lifecycle** — Start, complete, walkover actions
3. **Standings engine** — Calculate rankings with tiebreakers
4. **Swiss R2+ pairing** — Score-based pairing avoiding rematches
5. **Knockout bracket** — Generate single-elimination from qualifiers
6. **Control Center UX** — Round management, match controls, standings view

### Step 1: Schema & Type Updates

**Database migration** (`supabase/migrations/20250103000001_phase3_swiss_knockout.sql`):

```sql
-- Match phase tracking (swiss vs knockout)
ALTER TABLE bracket_blaze_matches
  ADD COLUMN phase TEXT NOT NULL DEFAULT 'swiss'
    CHECK (phase IN ('swiss', 'knockout'));

-- Knockout bracket linkage
ALTER TABLE bracket_blaze_matches
  ADD COLUMN next_match_id UUID REFERENCES bracket_blaze_matches(id),
  ADD COLUMN next_match_side TEXT CHECK (next_match_side IN ('A', 'B'));

-- Round tracking on standings
ALTER TABLE bracket_blaze_standings
  ADD COLUMN round INTEGER NOT NULL DEFAULT 1;

-- Change unique constraint to include round
ALTER TABLE bracket_blaze_standings
  DROP CONSTRAINT IF EXISTS bracket_blaze_standings_division_id_entry_id_key;
ALTER TABLE bracket_blaze_standings
  ADD CONSTRAINT bracket_blaze_standings_division_entry_round_key
    UNIQUE (division_id, entry_id, round);

-- RLS policies for Phase 3 tables (missing from previous migration)
ALTER TABLE bracket_blaze_match_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_court_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_conflicts_read" ON bracket_blaze_match_conflicts
  FOR SELECT USING (true);
CREATE POLICY "match_conflicts_write" ON bracket_blaze_match_conflicts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "court_assignments_read" ON bracket_blaze_court_assignments
  FOR SELECT USING (true);
CREATE POLICY "court_assignments_write" ON bracket_blaze_court_assignments
  FOR ALL USING (auth.uid() IS NOT NULL);
```

**TypeScript type updates** (`types/database.ts`):
- Add `phase`, `next_match_id`, `next_match_side`, `assigned_at`, `assigned_by`, `actual_start_time`, `actual_end_time`, `estimated_duration_minutes` to `Match` interface
- Add `scheduling_priority` to `Division` interface
- Add `round` to `Standing` interface
- Add `MatchConflict` and `CourtAssignment` interfaces

**Validation** (`lib/validations/tournament.ts`):
- Update `swiss_qualifiers` validation to enforce power of 2 (2, 4, 8, 16, 32)

### Step 2: Match Lifecycle Actions

Create `lib/actions/matches.ts` with three server actions:

**`startMatch(matchId)`**
- Validate current status is `ready`
- Set `status = 'on_court'`, `actual_start_time = now()`
- Revalidate control center path

**`completeMatch(matchId, winnerSide, games)`**
- Validate current status is `on_court`
- `games` = array of `{ score_a: number, score_b: number }` (e.g. `[{ score_a: 21, score_b: 18 }, { score_a: 21, score_b: 15 }]`)
- Set `status = 'completed'`, `winner_side`, `actual_end_time = now()`
- Store scores in `meta_json`: `{ games, total_points_a, total_points_b }`
- Trigger standings recalculation for this division + round
- Revalidate paths

**`recordWalkover(matchId, winnerSide)`**
- Validate status is `scheduled`, `ready`, or `on_court`
- Set `status = 'walkover'`, `winner_side`, `actual_end_time = now()`
- Store in `meta_json`: `{ walkover: true, games: [] }`
- **Walkover scoring rule**: Walkovers count as a win/loss but contribute 0 to `points_for`/`points_against`. The standings engine excludes walkovers from point aggregation — they only affect the W/L column. This prevents artificial inflation of point differentials.
- Trigger standings recalculation
- Revalidate paths

**Bye auto-completion**: Modify `generateDraw()` in `lib/actions/draws.ts` to immediately mark bye matches (where `side_b_entry_id = null`) as `completed` with `winner_side = 'A'` and appropriate `meta_json`.

**Match state machine validation**: Add a helper that enforces valid transitions:
- `scheduled → ready` (court assignment)
- `ready → on_court` (start match)
- `on_court → completed` (record result)
- `on_court → walkover` (retirement)
- `scheduled/ready → walkover` (no-show)
- `ready → scheduled` (clear court)

### Step 3: Standings Engine

Create `lib/services/standings-engine.ts`:

**`calculateStandings(divisionId, throughRound)`**
- Query all completed/walkover matches for the division up through `throughRound`
- For each entry, aggregate:
  - `wins` — matches won (including walkovers and byes)
  - `losses` — matches lost (including walkovers)
  - `points_for` — sum of game points scored (from non-walkover, non-bye matches only)
  - `points_against` — sum of game points conceded (from non-walkover, non-bye matches only)
- Compute tiebreak data for `tiebreak_json`:
  - `point_diff` = points_for - points_against
  - `h2h_results` = `{ [opponent_entry_id]: 'W' | 'L' }` for direct matchups
- Upsert into `bracket_blaze_standings` with the given `round`
- Return sorted standings applying tiebreak hierarchy

**`sortByTiebreaks(standings)`**
- Sort by: Wins DESC → Point Diff DESC → Points For DESC → H2H (2-player ties only) → Random seed (deterministic via entry ID sort as coin toss proxy)
- H2H only applies to 2-player ties; for 3+ player ties, skip to next tiebreaker

**`getQualifiers(divisionId)`**
- Get final round standings
- Return top N entries where N = `swiss_qualifiers` from `rules_json`
- Since qualifiers are power-of-2, no cutoff ambiguity

### Step 4: Swiss Subsequent Round Pairing

Extend `lib/services/draw-generators/swiss-engine.ts`:

**`generateNextRound(divisionId, currentRound)`**
- Fetch current standings (from Step 3)
- Build pairing history from completed matches (who played whom)
- Build bye history (who already had a bye)
- Group entries by win count (most wins first)
- Within each group, pair top-ranked vs bottom-ranked
- Check rematch constraints: if two players already played, try swapping with adjacent pair
- If group has odd size, float the bottom player down to the next group
- Assign bye to lowest-ranked player without a previous bye (if total entries is odd)
- Auto-complete bye match immediately
- Insert new round matches into `bracket_blaze_matches` with `round = currentRound + 1`

**`isRoundComplete(divisionId, round)`**
- Query matches for division + round where status NOT IN ('completed', 'walkover')
- Return true if count = 0

**`getCurrentRound(divisionId)`**
- Query MAX(round) from matches WHERE division_id AND phase = 'swiss'

**Draw state tracking**: Use the `bracket_blaze_draws` table (currently unused) to store:
```json
{
  "current_round": 3,
  "total_rounds": 5,
  "qualifiers": 8,
  "bye_history": ["entry-uuid-1", "entry-uuid-2"],
  "phase": "swiss"
}
```
Update this on each round generation.

### Step 5: Knockout Bracket Generation

Create `lib/services/draw-generators/knockout-engine.ts`:

**`generateKnockoutBracket(divisionId)`**
- Fetch qualifiers from standings engine (already sorted by rank)
- Validate qualifier count is power of 2
- Generate standard seeded bracket:
  - Round 1: Seed 1 vs Seed N, Seed 2 vs Seed N-1, etc.
  - Proper bracket positioning so top seeds meet latest in the bracket
- Create all bracket matches with:
  - `phase = 'knockout'`
  - `round` starting at 1 (independent of Swiss round numbering)
  - First round: `side_a_entry_id` and `side_b_entry_id` populated from qualifiers
  - Later rounds: entries left null, populated via `next_match_id`/`next_match_side` linkage
  - `next_match_id` and `next_match_side` set on each match pointing to the next round
- Update draw state: `{ phase: "knockout", bracket_size: N }`

**`advanceWinner(matchId)`**
- Called after a knockout match is completed
- Look up `next_match_id` and `next_match_side`
- Set the winner's entry ID on the next match's `side_a_entry_id` or `side_b_entry_id`
- If the next match now has both sides populated, it becomes schedulable

**Integrate into `completeMatch`**: After completing a knockout match, call `advanceWinner` automatically.

### Step 6: Control Center UX Enhancements

**Court Grid updates** (`components/control-center/court-grid.tsx`):
- Add "Start" button on courts with `ready` status matches
- Add "Record Result" button on courts with `on_court` status matches
- "Record Result" opens a dialog to select winner and enter game scores
- Show match elapsed time for `on_court` matches

**Ready Queue updates** (`components/control-center/ready-queue.tsx`):
- Filter by division (dropdown)
- Group by round with visual separator
- Hide bye matches (they're auto-completed)
- Show current round indicator per division

**New: Round Management Panel** (add to `control-center-client.tsx`):
- Per-division status: "Swiss R2 of 5 — 3/8 matches complete"
- "Generate Next Round" button (enabled when current round is complete, disabled if all Swiss rounds played)
- "Generate Knockout Bracket" button (enabled when all Swiss rounds complete)
- Current standings table (collapsible)

**New: Match Result Dialog** (`components/control-center/match-result-dialog.tsx`):
- Select winner (Side A / Side B)
- Enter game scores (dynamic rows: add game, with score inputs)
- Walkover option with winner selection
- Submit calls `completeMatch` or `recordWalkover`

**New: Knockout Bracket View** (`app/tournaments/[id]/divisions/[divisionId]/bracket/page.tsx`):
- Visual bracket display showing progression
- Completed matches show scores
- Pending matches show "TBD" or populated entry names
- Link from Control Center to this view

## Technical Considerations

**State machine enforcement**: All match status transitions should go through a validation function. The `clearCourt` action currently allows reverting any status to `scheduled` — add a guard to prevent clearing completed/walkover matches.

**TypeScript types out of sync**: The `Match` and `Division` interfaces in `types/database.ts` are missing Phase 3 columns added in migration `20250102000002`. Fix this in Step 1 before any other work.

**RLS policies missing**: The `bracket_blaze_match_conflicts` and `bracket_blaze_court_assignments` tables have no RLS policies. Add them in Step 1.

**Standings recalculation**: Triggered on every match completion. For a tournament with 32 entries and 5 Swiss rounds, this means ~80 recalculations — each querying ~16 matches. This is fine for MVP scale. If performance becomes an issue later, consider incremental updates.

**Knockout round numbering**: Knockout matches use `phase = 'knockout'` and `round` restarts at 1. Query knockout matches as `WHERE phase = 'knockout' AND round = X`.

**Draws table utilization**: The `bracket_blaze_draws` table exists but is unused. Use it to track draw state (current round, bye history, phase) so the system always knows where a division stands. This is the single source of truth for "what phase is this division in?" — the Control Center reads `state_json.phase` and `state_json.current_round` to decide which buttons to show (Generate Next Round vs Generate Knockout vs division complete).

**Swiss pairing edge cases**:
- Rematches: If no valid pairing exists without rematches in a score group, allow the rematch and log it
- Float-downs: When a score group has odd count, the bottom player floats to the next group
- All players have unique scores: Each "group" has 1 player, pair adjacent groups

## Acceptance Criteria

### Step 1: Schema & Types
- [ ] Migration runs successfully, all new columns exist
- [ ] TypeScript types match database schema exactly
- [ ] RLS policies active on all Phase 3 tables
- [ ] `swiss_qualifiers` validation enforces power of 2

### Step 2: Match Lifecycle
- [ ] TD can start a match (ready → on_court)
- [ ] TD can record a result with game scores (on_court → completed)
- [ ] TD can record a walkover (any pre-completed status → walkover)
- [ ] Bye matches are auto-completed on draw generation
- [ ] Invalid state transitions are rejected with clear error messages
- [ ] `clearCourt` cannot revert completed/walkover matches

### Step 3: Standings
- [ ] Standings auto-calculate after each match completion
- [ ] Standings show wins, losses, points for, points against, point diff
- [ ] Tiebreaks resolve correctly: Wins > Pt Diff > Pts For > H2H > Deterministic tiebreak
- [ ] Standings are per-round (can view standings after any completed round)

### Step 4: Swiss R2+ Pairing
- [ ] Next round generates correctly with score-based pairing
- [ ] Rematches are avoided when possible
- [ ] Byes rotate (no player gets two byes)
- [ ] System correctly detects when current round is complete
- [ ] System correctly detects when all Swiss rounds are complete
- [ ] Draw state tracks current round and bye history

### Step 5: Knockout Bracket
- [ ] Knockout bracket generates from top N Swiss qualifiers
- [ ] Bracket is properly seeded (1 vs N, 2 vs N-1, etc.)
- [ ] Completing a knockout match auto-advances winner to next round
- [ ] Final match completion marks division as finished
- [ ] Bracket view shows progression visually

### Step 6: Control Center
- [ ] "Start Match" and "Record Result" buttons work on Court Grid
- [ ] Match result dialog captures winner + game scores
- [ ] Ready Queue filters by division
- [ ] "Generate Next Round" button appears when round is complete
- [ ] "Generate Knockout" button appears when Swiss phase is done
- [ ] Standings panel shows current standings per division
- [ ] Bye matches don't appear in Ready Queue

## Dependencies & Risks

**Dependencies**: Each step builds on the previous. Steps 1-2 are prerequisites for everything else. Step 3 is required before Step 4. Step 4 is required before Step 5.

**Risks**:
- Swiss pairing algorithm complexity: the rematch-avoidance + score-grouping logic has edge cases. Mitigation: allow rematches as fallback when no valid pairing exists.
- Standings tiebreak correctness: H2H in multi-way ties is inherently complex. Mitigation: limit H2H to 2-player ties only, fall through to deterministic tiebreak for 3+.
- Concurrent match updates: multiple TDs or future referee app could cause race conditions. Mitigation: optimistic locking is deferred but match status validation prevents most issues.

## Out of Scope (Phase 3)

- Mexicano format
- Groups + Knockout format
- Referee App (Phase 4)
- Real-time Supabase subscriptions (can add later as enhancement)
- Drag-and-drop court assignment (click-to-assign works)
- TD sign-off workflow (Phase 4)
- Auto-assignment greedy algorithm (nice-to-have, can add later)
- Late addition enforcement (entries page allows adds, pairing handles them)
- Player withdrawal cascading (TD can manually walkover affected matches)

## References

- Swiss engine: `lib/services/draw-generators/swiss-engine.ts`
- Draw generation action: `lib/actions/draws.ts`
- Court assignment action: `lib/actions/court-assignments.ts`
- Control Center: `components/control-center/`
- Database types: `types/database.ts`
- Phase 3 migration: `supabase/migrations/20250102000002_phase3_scheduling.sql`
- PRD: `racquet_tournament_manager_mvp_prd_canvas.md`
