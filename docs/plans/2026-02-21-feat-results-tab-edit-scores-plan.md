---
title: "feat: Add Results Tab with Score Editing to Control Center"
type: feat
status: active
date: 2026-02-21
---

# feat: Add Results Tab with Score Editing to Control Center

## Overview

Add a third "Results" tab to the Control Center showing all completed matches with scores, filterable by round and division. Include an "Edit Score" action so the TD can correct match results before generating the next round.

## Problem Statement

After completing matches, the TD has no way to:
1. **View results** — completed matches disappear from the Courts tab (filtered out)
2. **Correct mistakes** — if a score was entered wrong, there's no way to fix it without direct DB access
3. **Verify before advancing** — before generating the next round, the TD needs to confirm all results are correct

## Proposed Solution

### Layout

```
┌──────────────────────────────────────────────────────┐
│  RoundManagement (existing)                          │
├──────────────────────────────────────────────────────┤
│  [Courts]  [Standings]  [Results]                    │
├──────────────────────────────────────────────────────┤
│  Results Tab:                                        │
│  ┌─ Filter: [All Rounds ▼] ───────────────────────┐ │
│  │                                                  │ │
│  │  ── Men's Singles ──────────────────────────────  │ │
│  │  R1 M1  Reyansh Joshi  15-11  Arjun Kapoor [Edit]│ │
│  │  R1 M2  Rahul Saxena   15-13  Vikram Patel [Edit]│ │
│  │  R1 M3  Pranav K.       3-15  Aarav Singh  [Edit]│ │
│  │  R1 M4  ...             W/O   ...          [Edit]│ │
│  │  ...                                             │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create `editMatchScore` server action

**File:** `lib/actions/matches.ts`

New exported function that updates an already-completed match's score:

```typescript
export async function editMatchScore(
  matchId: string,
  winnerSide: WinnerSide,
  games: GameScore[]
) {
  // 1. Auth check (requireAuth + isTournamentAdminForMatch)
  // 2. Fetch match — must be 'completed' or 'walkover'
  // 3. Validate games (at least 1, no negatives)
  // 4. Guard: if knockout match and winner changed,
  //    check next_match hasn't started (status must be 'scheduled')
  // 5. Update meta_json, winner_side on the match
  // 6. If knockout and winner changed: update next_match entry_id
  // 7. revalidatePath
}
```

Key rules:
- Match must be in `completed` or `walkover` status (stays in that status)
- No state transition — just updating score data and winner
- For knockout matches where winner changes: clear old winner from `next_match`, set new winner — but only if `next_match.status === 'scheduled'`
- If `next_match` has already started/completed, return error: "Cannot change winner — next match already in progress"

### Step 2: Create `ResultsSection` component

**File:** `components/control-center/results-section.tsx`

Follow the `StandingsSection` pattern. Props:

```typescript
interface ResultsSectionProps {
  divisions: Division[]
  matches: any[]
  entries: EntryInfo[]
  onEditScore: (match: any) => void
}
```

Features:
- Filter completed/walkover matches from the `matches` array
- Round filter dropdown using shadcn `Select` (default: "All Rounds", options derived from match data)
- Group results by division (same card-per-division pattern as StandingsSection)
- Table columns: Match #, Side A, Score, Side B, Status, Edit button
- Score display: `15-11` from `meta_json.games[0]` (single game) or `21-15, 18-21, 21-17` (multi-game)
- Walkover matches show "W/O" badge instead of score
- Bye matches excluded (no `side_b_entry_id`)
- Winner name shown in bold
- Edit button on each row calls `onEditScore(match)`

### Step 3: Extend `MatchResultDialog` for edit mode

**File:** `components/control-center/match-result-dialog.tsx`

Add optional props to support pre-populating existing scores:

```typescript
interface MatchResultDialogProps {
  // ... existing props ...
  initialGames?: GameScore[]        // Pre-populate for edit mode
  initialWalkover?: boolean         // Pre-set walkover toggle
  mode?: 'record' | 'edit'         // Changes dialog title and submit label
}
```

When `mode === 'edit'`:
- Dialog title: "Edit Match Score" instead of "Record Result"
- Submit button: "Save Changes" instead of "Submit Result"
- Games state initialized from `initialGames` instead of `[{ score_a: 0, score_b: 0 }]`
- Walkover toggle initialized from `initialWalkover`

### Step 4: Wire into `ControlCenterClient`

**File:** `components/control-center/control-center-client.tsx`

Changes:
- Import `ResultsSection`
- Add `handleEditScore` handler that calls `editMatchScore` server action
- Add edit-mode state to `resultDialog`:
  ```typescript
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    match: any | null
    mode: 'record' | 'edit'
  }>({ open: false, match: null, mode: 'record' })
  ```
- Add handler for opening edit dialog:
  ```typescript
  const handleOpenEditDialog = (match: any) => {
    setResultDialog({ open: true, match, mode: 'edit' })
  }
  ```
- Add third tab:
  ```tsx
  <TabsTrigger value="results">Results</TabsTrigger>
  <TabsContent value="results" className="mt-4">
    <ResultsSection
      divisions={divisions}
      matches={matches}
      entries={entries}
      onEditScore={handleOpenEditDialog}
    />
  </TabsContent>
  ```
- Pass `mode` and `initialGames` to `MatchResultDialog`
- Update `handleSubmitResult` to branch on mode:
  ```typescript
  const action = resultDialog.mode === 'edit' ? editMatchScore : completeMatch
  const result = await action(matchId, winnerSide, games)
  ```

## Technical Considerations

- **No new data fetching needed** — completed matches are already in the `matches` prop (fetched in page.tsx). The Results tab filters client-side.
- **Standings auto-update** — after editing a score, `router.refresh()` triggers server re-render, which calls `calculateStandings()` fresh. No extra work needed.
- **Knockout winner change guard** — the `editMatchScore` action checks `next_match.status` before allowing a winner change on knockout matches. This prevents cascading bracket corruption.
- **No round-generation guard for MVP** — we don't block editing R1 scores after R2 is generated. The TD is responsible for verifying before advancing. This keeps the implementation simple and matches how the reference app works.

## Acceptance Criteria

- [ ] Third "Results" tab visible in Control Center after Courts and Standings
- [ ] Results tab shows all completed matches grouped by division
- [ ] Round filter dropdown filters results (default: All Rounds)
- [ ] Each result row shows: match number, player names, score, winner highlight, status
- [ ] Walkover matches display "W/O" badge
- [ ] "Edit" button on each result row opens the score dialog pre-populated with existing scores
- [ ] Edited scores update `meta_json` and `winner_side` in the database
- [ ] Standings reflect edited scores after page refresh
- [ ] Knockout matches: editing blocked if winner changes and next match already started
- [ ] Auth enforced on `editMatchScore` action
- [ ] Build passes (`npx next build`)

## Files to Create/Modify

| File | Action |
|------|--------|
| `components/control-center/results-section.tsx` | Create |
| `lib/actions/matches.ts` | Modify (add `editMatchScore`) |
| `components/control-center/match-result-dialog.tsx` | Modify (add edit mode props) |
| `components/control-center/control-center-client.tsx` | Modify (add Results tab + edit handlers) |

## References

- StandingsSection pattern: `components/control-center/standings-section.tsx`
- Match result dialog: `components/control-center/match-result-dialog.tsx`
- Match server actions: `lib/actions/matches.ts`
- Score types: `types/database.ts` (GameScore, MatchScoreData, WinnerSide)
- Standings engine: `lib/services/standings-engine.ts`
