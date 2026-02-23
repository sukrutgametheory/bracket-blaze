---
title: "perf: Fix N+1 queries in checkConflicts court assignment"
type: refactor
status: completed
date: 2026-02-22
---

# perf: Fix N+1 queries in checkConflicts court assignment

## Overview

The `assignMatchToCourt` server action takes 10+ seconds for doubles tournaments because `checkConflicts` makes 60-80+ sequential database queries. The fix batches lookups, eliminates redundant queries, adds a time filter, and parallelizes independent calls — while preserving all conflict detection integrity.

## Problem Statement

When a TD assigns a match to a court, the call chain is:

```
assignMatchToCourt
  → requireAuth()                          1 query
  → isTournamentAdminForMatch()            3 queries (match → division → tournament)
  → fetch match.division_id                1 query  ← REDUNDANT (already in auth)
  → getTournamentIdForDivision()           1 query  ← REDUNDANT (already in auth)
  → checkConflicts()
      → fetch match with entries           1 query
      → resolveEntryParticipantIds × 2     2 queries (doubles team_members)
      → fetch tournament divisions         1 query
      → fetch active court matches         1 query
      → FOR EACH active match:             2 queries each (N+1!)
          resolveEntryParticipantIds × 2
          + 1 per conflict (name lookup)
      → fetch tournament.rest_window       1 query
      → fetch ALL completed matches        1 query  ← UNBOUNDED
      → FOR EACH completed match:          2 queries each (N+1!)
          resolveEntryParticipantIds × 2
          + 1 per rest violation (name lookup)
  → update match                           1 query
  → insert court_assignment log            1 query
```

**With 5 active + 30 completed doubles matches: ~82 sequential queries minimum.**

Each query has ~100-150ms network latency to Supabase = **8-12 seconds**.

## Proposed Solution

Reduce to **~10-12 queries total** regardless of match count by:

1. **Eliminate redundant queries** — refactor `isTournamentAdminForMatch` to return `divisionId` and `tournamentId` alongside the boolean, pass through to `checkConflicts`
2. **Batch team_members** — collect all `team_id`s from all matches, fetch team_members in ONE `.in()` query, build a lookup Map
3. **Batch participant names** — collect all conflicting participant IDs, fetch names in ONE query
4. **Time-filter completed matches** — add `.gte("actual_end_time", cutoffISO)` so only recent matches (within rest window) are fetched
5. **Parallelize independent queries** — use `Promise.all()` for queries that don't depend on each other
6. **Pass `restWindowMinutes` into checkConflicts** — fetch once in the caller alongside auth, avoid redundant tournament query

## Implementation

### Step 1: Refactor auth helper to return context

`lib/auth/require-auth.ts` — add a new helper or modify `isTournamentAdminForMatch` to return useful data:

```typescript
// lib/auth/require-auth.ts
export async function requireTournamentAdminForMatch(
  supabase: ServerSupabase,
  matchId: string,
  userId: string
): Promise<{ authorized: boolean; divisionId?: string; tournamentId?: string; restWindowMinutes?: number }> {
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("division_id")
    .eq("id", matchId)
    .single()

  if (!match?.division_id) return { authorized: false }

  const { data: division } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", match.division_id)
    .single()

  if (!division?.tournament_id) return { authorized: false }

  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("created_by, rest_window_minutes")
    .eq("id", division.tournament_id)
    .single()

  return {
    authorized: tournament?.created_by === userId,
    divisionId: match.division_id,
    tournamentId: division.tournament_id,
    restWindowMinutes: tournament?.rest_window_minutes ?? 15,
  }
}
```

This replaces 5 redundant queries (steps 2-5 in the chain) with the 3 already needed for auth.

### Step 2: Rewrite checkConflicts with batch queries

`lib/actions/court-assignments.ts`:

```typescript
async function checkConflicts(
  supabase: ServerSupabase,
  matchId: string,
  tournamentId: string,
  restWindowMinutes: number
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = []

  // 1. Fetch match + all division IDs in parallel (2 queries, parallel)
  const [matchResult, divisionsResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`*, side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
                  side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)`)
      .eq("id", matchId)
      .single(),
    supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("id")
      .eq("tournament_id", tournamentId),
  ])

  const match = matchResult.data
  if (!match) return warnings
  const divisionIds = divisionsResult.data?.map(d => d.id) || []
  if (divisionIds.length === 0) return warnings

  // 2. Fetch active court matches + recent completed matches in parallel (2 queries, parallel)
  const cutoffTime = new Date(Date.now() - restWindowMinutes * 60 * 1000).toISOString()

  const [activeResult, recentResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`*, court:bracket_blaze_courts(name),
               side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
               side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)`)
      .neq("id", matchId)
      .not("court_id", "is", null)
      .in("status", ["scheduled", "ready", "on_court"])
      .in("division_id", divisionIds),
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`*, side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
               side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)`)
      .neq("id", matchId)
      .in("status", ["completed", "walkover"])
      .not("actual_end_time", "is", null)
      .gte("actual_end_time", cutoffTime)
      .in("division_id", divisionIds),
  ])

  // 3. Collect ALL team_ids from all matches, batch-fetch team_members (1 query)
  const allMatches = [match, ...(activeResult.data || []), ...(recentResult.data || [])]
  const allTeamIds = new Set<string>()
  for (const m of allMatches) {
    if (m.side_a?.team_id) allTeamIds.add(m.side_a.team_id)
    if (m.side_b?.team_id) allTeamIds.add(m.side_b.team_id)
  }

  const teamMemberMap = new Map<string, string[]>()  // team_id → participant_ids
  if (allTeamIds.size > 0) {
    const { data: members } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select("team_id, participant_id")
      .in("team_id", Array.from(allTeamIds))

    for (const m of members || []) {
      const existing = teamMemberMap.get(m.team_id) || []
      existing.push(m.participant_id)
      teamMemberMap.set(m.team_id, existing)
    }
  }

  // Helper: resolve participant IDs from entry using the pre-fetched map
  function resolveIds(entry: { participant_id: string | null; team_id: string | null } | null): string[] {
    if (!entry) return []
    if (entry.participant_id) return [entry.participant_id]
    if (entry.team_id) return teamMemberMap.get(entry.team_id) || []
    return []
  }

  const matchParticipantIds = [...resolveIds(match.side_a), ...resolveIds(match.side_b)]
  if (matchParticipantIds.length === 0) return warnings

  // 4. Check player overlaps (in-memory, no queries)
  const conflictParticipantIds = new Set<string>()

  for (const otherMatch of activeResult.data || []) {
    const otherIds = [...resolveIds(otherMatch.side_a), ...resolveIds(otherMatch.side_b)]
    const overlapping = matchParticipantIds.filter(id => otherIds.includes(id))
    for (const id of overlapping) {
      conflictParticipantIds.add(id)
      warnings.push({
        type: "player_overlap",
        severity: "error",
        message: `__PLAYER_${id}__ is already assigned to ${otherMatch.court?.name}`,
      })
    }
  }

  // 5. Check rest violations (in-memory, no queries)
  for (const recentMatch of recentResult.data || []) {
    const recentIds = [...resolveIds(recentMatch.side_a), ...resolveIds(recentMatch.side_b)]
    const overlapping = matchParticipantIds.filter(id => recentIds.includes(id))

    if (overlapping.length > 0 && recentMatch.actual_end_time) {
      const endTime = new Date(recentMatch.actual_end_time)
      const minutesSinceEnd = (Date.now() - endTime.getTime()) / (1000 * 60)

      if (minutesSinceEnd < restWindowMinutes) {
        const remainingRest = Math.ceil(restWindowMinutes - minutesSinceEnd)
        for (const id of overlapping) {
          conflictParticipantIds.add(id)
          warnings.push({
            type: "rest_violation",
            severity: "warning",
            message: `__PLAYER_${id}__ finished a match ${Math.floor(minutesSinceEnd)} min ago (needs ${remainingRest} more min rest)`,
          })
        }
      }
    }
  }

  // 6. Batch-fetch all conflicting participant names (1 query)
  if (conflictParticipantIds.size > 0) {
    const { data: players } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("id, display_name")
      .in("id", Array.from(conflictParticipantIds))

    const nameMap = new Map(players?.map(p => [p.id, p.display_name]) || [])

    // Replace placeholders with actual names
    for (const w of warnings) {
      const match = w.message.match(/__PLAYER_(.+?)__/)
      if (match) {
        w.message = w.message.replace(`__PLAYER_${match[1]}__`, nameMap.get(match[1]) || "A player")
      }
    }
  }

  return warnings
}
```

### Step 3: Update assignMatchToCourt caller

```typescript
export async function assignMatchToCourt(matchId, courtId, override, overrideReason) {
  const auth = await requireAuth()
  // ... auth check ...

  const adminCheck = await requireTournamentAdminForMatch(supabase, matchId, user.id)
  if (!adminCheck.authorized) return { error: "Not authorized" }

  const { divisionId, tournamentId, restWindowMinutes } = adminCheck

  const warnings = await checkConflicts(supabase, matchId, tournamentId!, restWindowMinutes!)

  // ... rest unchanged ...
}
```

### Query Count Comparison

| Scenario | Before | After |
|---|---|---|
| Base queries (auth + setup) | 6 | 3 |
| checkConflicts fixed queries | 4+ | 5 (parallel: match+divisions, active+recent, team_members) |
| Per active match (N+1) | 2 per match | 0 (in-memory) |
| Per completed match (N+1) | 2 per match | 0 (in-memory) |
| Name lookups | 1 per conflict | 1 total (batch) |
| Rest window fetch | 1 | 0 (passed in) |
| Write operations | 2-3 | 2-3 (unchanged) |
| **Total (5 active + 30 completed)** | **~82** | **~11** |
| **Estimated time** | **8-12s** | **<1s** |

## Acceptance Criteria

- [x] `assignMatchToCourt` completes in <1s for doubles tournaments with 30+ completed matches
- [x] Player overlap detection still works for both singles and doubles
- [x] Rest period violation detection still works with correct time window
- [x] Walkover matches included in rest period check (add `"walkover"` to status filter)
- [x] Override mechanism preserved (errors block, warnings prompt)
- [x] Court assignment audit log still written
- [x] Conflict override records still written when applicable
- [x] No redundant queries (division_id, tournament_id fetched once in auth chain)
- [x] Completed matches query filtered by `actual_end_time >= now - restWindowMinutes`

## Edge Cases to Handle

1. **Singles entries** (participant_id, no team_id) — `resolveIds` returns `[participant_id]` directly, no team_members lookup needed
2. **Mixed tournament** (some divisions singles, some doubles) — batch team_members query only includes non-null team_ids
3. **No active/completed matches** — empty arrays, no N+1, early returns
4. **Multiple conflicts for same player** — may produce duplicate warnings (deduplication is out of scope, cosmetic only)
5. **Walkover matches** — include in rest check (add `"walkover"` to status filter)
6. **`actual_end_time` null on completed match** — already filtered by `.not("actual_end_time", "is", null)`

## Files to Modify

- `lib/actions/court-assignments.ts` — rewrite `checkConflicts`, `assignMatchToCourt`, remove `resolveEntryParticipantIds`
- `lib/auth/require-auth.ts` — add `requireTournamentAdminForMatch` (returns context alongside auth)

## Out of Scope (Noted for Future)

- Court double-booking race condition (needs DB constraint — separate fix)
- Transaction wrapping for multi-step writes
- Index on `actual_end_time` (sequential scan is fine for time-filtered subset)
- Warning deduplication (multiple warnings for same player — cosmetic)
- Override reason UI (currently hardcoded — UX improvement)

## References

- `lib/actions/court-assignments.ts:42-177` — current checkConflicts
- `lib/auth/require-auth.ts:55-69` — current isTournamentAdminForMatch
- `lib/actions/entries.ts` — existing `.in()` batch pattern
- `lib/services/standings-engine.ts` — existing batch upsert pattern
- `docs/2026-02-22-codebase-review-findings.md` — findings #18, #19
