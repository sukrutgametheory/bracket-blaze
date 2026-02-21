---
title: "feat: Public Live Portal — Standings & Matches"
type: feat
status: completed
date: 2026-02-22
---

# feat: Public Live Portal — Standings & Matches

## Overview

Build a public (no-auth) page at `/live/[tournamentId]` where players and spectators can view live standings and match results with real-time score updates. This is the player-facing counterpart to the TD Control Center — players check it on their phones between matches.

Single page, two tabs: **Standings** (Swiss leaderboard + knockout bracket) and **Matches** (card-based view of live and completed matches). One URL to share — TD posts it on a whiteboard, players bookmark it.

## Problem Statement / Motivation

Players currently have no way to see standings or match results without asking the TD. Between matches, they want to check:
- Where they stand in their division
- What matches are happening now (and scores)
- Results of completed matches

The TD shouldn't be interrupted for this. A public URL solves it.

## Proposed Solution

Follow the proven Court TV pattern (`app/tv/[tournamentId]`): server component fetches data, client component handles tabs and Realtime subscriptions. Reuse the existing `StandingsSection` component directly. Build a new card-based `MatchCard` component for the Matches tab.

## Technical Approach

### Architecture

```
app/live/[tournamentId]/page.tsx          ← Server component (data fetch)
components/live-portal/live-portal-client.tsx  ← Client wrapper (tabs, Realtime)
components/live-portal/match-card.tsx      ← Match card component
```

Same dual-channel Realtime pattern as Court TV:
- **Broadcast** channels per active match for instant score ticks (20-80ms)
- **postgres_changes** on matches table for status transitions (triggers data refresh)

### Implementation Steps

#### Step 1: Route & Middleware Setup
- [x] Add `live/` to middleware matcher exclusion in `middleware.ts`
  - Change: `tv/|score/` → `tv/|score/|live/`
  - File: `middleware.ts:17`
- [x] Create `app/live/[tournamentId]/page.tsx` server component
  - Follow `app/tv/[tournamentId]/page.tsx` pattern exactly
  - No auth check (public page)
  - Fetch: tournament, divisions (published), matches (live + completed), draws, entries, standings
  - Pass `supabaseUrl` and `supabaseAnonKey` as props for client Realtime

#### Step 2: Server Data Fetching
- [x] Fetch tournament by ID (filter `status: 'active'`), `notFound()` if missing
- [x] Fetch published divisions (`is_published: true`)
- [x] Fetch matches with nested joins (division, side_a, side_b, court)
  - Filter statuses: `['on_court', 'completed', 'walkover']`
  - Include court join for court name: `court:bracket_blaze_courts(id, name)`
  - Select fields: id, status, court_id, meta_json, round, sequence, phase, winner_side, actual_start_time, actual_end_time, division_id
- [x] Fetch draw state per division (for standings context)
- [x] Calculate standings per division using `calculateStandings()` from `lib/services/standings-engine.ts`
- [x] Fetch entries with participant names for standings display

#### Step 3: Client Component — LivePortalClient
- [x] Create `components/live-portal/live-portal-client.tsx`
- [x] Tab state: Standings / Matches (using shadcn `Tabs`, default tab: **Matches** — shows what's happening now)
- [x] Division filter dropdown above tabs (default: "All Divisions", applies to both tabs)
- [x] Broadcast subscriptions for active matches (same pattern as `court-tv-client.tsx:58-83`)
- [x] postgres_changes subscription for match status transitions → `window.location.reload()`
- [x] Auto-reconnect on visibility change (tab/screen wake)
- [x] Pass `supabaseUrl` and `supabaseAnonKey` from server component

#### Step 4: Standings Tab
- [x] Reuse `StandingsSection` from `components/control-center/standings-section.tsx` directly
  - Already handles: Swiss table, qualifier highlights, knockout bracket view, division cards
  - No TD-specific actions — purely display
  - Props: divisions, standings, draws, entries, matches
  - Note: Import path is `@/components/control-center/standings-section` — acceptable since the component is presentation-only

#### Step 5: Matches Tab — Match Cards
- [x] Create `components/live-portal/match-card.tsx`
- [x] Card layout for each match:

  ```
  ┌─────────────────────────────────────────┐
  │ ● LIVE        Men's Singles · Round 3   │  ← green pulse dot + division + round
  │                                         │
  │  John Smith              15             │  ← bold winner, live score from Broadcast
  │  vs                                     │
  │  Mike Johnson            12             │
  │                                         │
  │  21-18, 21-15            Court 3 · 32m  │  ← game-by-game chips + court + duration
  └─────────────────────────────────────────┘
  ```

  - Player/team names with scores (bold winner side)
  - Division name + round label ("Round 3" or "Quarter-Final" / "Semi-Final" / "Final")
  - Court name + time played (duration since `actual_start_time`)
  - Game-by-game score breakdown (small chips)
  - Live matches: pulsing green dot + "LIVE" label + real-time score via Broadcast
  - Completed matches: no dot, final scores shown, winner bolded
- [x] Match ordering: Live matches pinned to top, completed sorted newest-first by `actual_end_time`
- [x] Division filter applied to matches list
- [x] `pending_signoff` matches excluded — they are TD territory, not public
- [x] Empty state: "No matches yet" when no live/completed matches exist

#### Step 6: Copy Live Link in Control Center
- [x] Add "Copy Live Portal Link" button to control-center-client.tsx alongside existing "Copy Court TV Link"
  - URL: `${window.location.origin}/live/${tournament.id}`

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `middleware.ts` | Edit | Add `live/` to matcher exclusion |
| `app/live/[tournamentId]/page.tsx` | Create | Server component — data fetch |
| `components/live-portal/live-portal-client.tsx` | Create | Client wrapper — tabs, Realtime, division filter |
| `components/live-portal/match-card.tsx` | Create | Match card component |
| `components/control-center/control-center-client.tsx` | Edit | Add "Copy Live Portal Link" button |

### Existing Code Reuse

| Component / Function | Location | Reuse Strategy |
|---------------------|----------|----------------|
| `StandingsSection` | `components/control-center/standings-section.tsx` | Import directly — no changes needed |
| `SwissStandingsTable` | Inside standings-section.tsx | Used internally by StandingsSection |
| `KnockoutBracketView` | Inside standings-section.tsx | Used internally by StandingsSection |
| `calculateStandings()` | `lib/services/standings-engine.ts` | Call from server page |
| `getKnockoutRoundLabel()` | standings-section.tsx (also in results-section.tsx) | Copy to match-card.tsx |
| `formatScore()` | results-section.tsx | Copy to match-card.tsx |
| Court TV Realtime pattern | `components/court-tv/court-tv-client.tsx` | Follow same Broadcast + postgres_changes pattern |

## Acceptance Criteria

### Functional
- [ ] `/live/[tournamentId]` loads without auth for any active tournament
- [ ] Invalid tournament IDs show 404
- [ ] Standings tab shows Swiss leaderboard with qualifier highlights per division
- [ ] Standings tab shows knockout bracket when division is in knockout phase
- [ ] Matches tab shows live matches with pulsing indicator and real-time score updates
- [ ] Matches tab shows completed matches with final scores and game-by-game breakdown
- [ ] Live matches pinned to top of Matches tab
- [ ] Division filter works across both tabs
- [ ] Score updates arrive via Broadcast within ~100ms of referee tap
- [ ] New match completions trigger page refresh via postgres_changes
- [ ] Page reconnects after tab/screen wake (visibility change handler)
- [ ] "Copy Live Portal Link" button works in control center

### Non-Functional
- [ ] Mobile-friendly layout (primary use case is phones)
- [ ] Supports 50+ concurrent viewers without degradation
- [ ] No scheduled or pending_signoff matches visible to public

## Dependencies & Risks

**Dependencies**: None — all infrastructure (RLS policies, Realtime, standings engine) already exists.

**Risks**:
- **Stale data on poor connections**: Mitigated by postgres_changes fallback + visibility change reload
- **Many Broadcast channels**: Each live match = 1 channel. At peak, maybe 7 courts = 7 channels per viewer. Well within Supabase limits.

## References & Research

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-22-public-live-portal-brainstorm.md`
- Court TV pattern: `app/tv/[tournamentId]/page.tsx`
- Court TV client: `components/court-tv/court-tv-client.tsx`
- Standings component: `components/control-center/standings-section.tsx`
- Results component: `components/control-center/results-section.tsx`
- Standings engine: `lib/services/standings-engine.ts`
- Control center page: `app/tournaments/[id]/control-center/page.tsx`
- Middleware: `middleware.ts:17`
