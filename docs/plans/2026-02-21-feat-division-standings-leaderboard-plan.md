---
title: "feat: Add Division Standings Leaderboard to Control Center"
type: feat
status: active
date: 2026-02-21
---

# feat: Add Division Standings Leaderboard to Control Center

## Overview

Add a per-division standings table to the Control Center so the TD can see the current leaderboard (Rank, Player, W-L, PF, PA, Diff) alongside the round status. The standings engine already exists — this is purely a data-fetching + UI task.

## Problem Statement

After completing matches, the TD has no visibility into standings from the Control Center. They must navigate to a separate page to see who's leading. For a tournament director making scheduling and knockout decisions, standings must be visible at a glance.

## Proposed Solution

Add a `StandingsSection` component to the Control Center, displayed below the `RoundManagement` panel. One collapsible card per division, each containing a standings table with the current round's leaderboard.

### Layout

```
┌─────────────────────────────────────────────────┐
│  RoundManagement (existing - per division)      │
├─────────────────────────────────────────────────┤
│  StandingsSection (NEW - per division)          │
│  ┌─ Men's Singles ─ R2 of 5 ────────── [▼] ──┐ │
│  │ #  Player            W-L   PF   PA  Diff   │ │
│  │ 1  Reyansh Joshi     2-0   42   18  +24    │ │
│  │ 2  Rahul Saxena      2-0   38   22  +16    │ │
│  │ 3  Pranav Kulkarni   1-1   30   30    0    │ │
│  │ ...                                        │ │
│  │ Qualifier line shown at position N         │ │
│  └────────────────────────────────────────────┘ │
├───────────────────────┬─────────────────────────┤
│  CourtGrid (2/3)      │  ReadyQueue (1/3)       │
└───────────────────────┴─────────────────────────┘
```

## Implementation Steps

### Step 1: Fetch standings server-side in `page.tsx`

**File:** `app/tournaments/[id]/control-center/page.tsx`

- After fetching divisions and draws, loop through each published division
- For each division, read `current_round` from the draw state
- Call `calculateStandings(divisionId, currentRound)` to get ranked standings
- Fetch entries with participant names for display
- Pass `standings` map to `ControlCenterClient`

```typescript
// Compute standings per division
const standingsMap: Record<string, RankedStanding[]> = {}
for (const division of divisions || []) {
  const drawState = draws?.find(d => d.division_id === division.id)?.state_json as any
  const currentRound = drawState?.current_round || 1
  const { standings } = await calculateStandings(division.id, currentRound)
  standingsMap[division.id] = standings || []
}

// Fetch entries with participant names for standings display
const { data: entriesWithParticipants } = await supabase
  .from(TABLE_NAMES.ENTRIES)
  .select("id, seed, participant:bracket_blaze_participants(display_name, club)")
  .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])
```

### Step 2: Create `StandingsSection` component

**File:** `components/control-center/standings-section.tsx`

- Accept props: `divisions`, `standings` (map), `draws`, `entries` (with participant names)
- Loop through divisions (same pattern as `RoundManagement`)
- For each division, render a collapsible Card with a Table inside
- Columns: Rank, Player (name + club), W-L, PF, PA, Diff
- Highlight the qualifier cutoff line (dashed border below position N if `qualifiers > 0`)
- Show "No matches completed yet" if standings are empty
- Skip divisions in knockout phase (standings are Swiss-only)

Table uses `shadcn/ui Table` component (`components/ui/table.tsx`).

### Step 3: Wire into `ControlCenterClient`

**File:** `components/control-center/control-center-client.tsx`

- Add `standings` and `entries` props to `ControlCenterClientProps`
- Render `<StandingsSection />` between `RoundManagement` and the Court/Queue grid

### Step 4: Update page.tsx to pass new props

**File:** `app/tournaments/[id]/control-center/page.tsx`

- Pass `standings={standingsMap}` and `entriesWithParticipants` to `ControlCenterClient`

## Technical Considerations

- **`calculateStandings` creates its own Supabase client** — it's a server-side function, safe to call from page.tsx (Server Component)
- **Standings are recalculated on every page load** — this is fine for MVP; the function also upserts to DB as a cache
- **No real-time updates** — standings refresh when the page reloads (via `router.refresh()` after match completion, which already happens)
- **Qualifier cutoff**: draw state has `qualifiers` count — use it to draw a visual separator in the table

## Acceptance Criteria

- [ ] Each published Swiss division shows a standings table in the Control Center
- [ ] Table columns: Rank, Player (name + club), W-L, Points For, Points Against, Diff
- [ ] Standings reflect all completed matches through the current round
- [ ] Qualifier cutoff line visible when `qualifiers > 0`
- [ ] Knockout-phase divisions show "Knockout in progress" instead of standings table
- [ ] Empty state: "No matches completed yet" when no standings exist
- [ ] Standings refresh after recording a match result (via existing `router.refresh()`)
- [ ] Build passes (`npx next build`)

## Files to Create/Modify

| File | Action |
|------|--------|
| `components/control-center/standings-section.tsx` | Create |
| `components/control-center/control-center-client.tsx` | Modify (add props + render) |
| `app/tournaments/[id]/control-center/page.tsx` | Modify (fetch standings + entries) |

## References

- Standings engine: `lib/services/standings-engine.ts` (calculateStandings, RankedStanding)
- Round management pattern: `components/control-center/round-management.tsx` (division loop)
- Table component: `components/ui/table.tsx`
- Draw state shape: `{ current_round, total_rounds, qualifiers, phase, bye_history }`
