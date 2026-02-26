# N+1 Query Performance Analysis & Solutions

**Date:** 2026-02-22
**Focus:** Supabase server action query optimization patterns
**Status:** RESEARCH COMPLETE - Ready for implementation

---

## Executive Summary

The codebase has **one critical N+1 query bottleneck** in `lib/actions/court-assignments.ts` and **several other sequential update patterns** that can be batched. Supabase doesn't have native batch-read APIs, but the codebase already demonstrates effective patterns using `.in()` filters. The fix involves:

1. **Batch-load team members** before loop (avoid per-match query)
2. **Consolidate participant lookups** using `.in()`
3. **Batch updates** instead of sequential loops
4. **Pre-fetch relationships** in initial queries instead of lazy-loading

---

## N+1 BOTTLENECK: `checkConflicts()` in court-assignments.ts

### Current Problem

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/court-assignments.ts:42-177`

The `checkConflicts()` function executes **1 + N queries per match assignment:**

```typescript
async function checkConflicts(
  supabase: ServerSupabase,
  matchId: string,
  tournamentId: string
): Promise<ConflictWarning[]> {
  // Query 1: Fetch the match being assigned (with entries)
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
    `)
    .eq("id", matchId)
    .single()

  // Queries 2-3: Resolve participant IDs (if team_id exists, queries team_members)
  const sideAIds = await resolveEntryParticipantIds(supabase, match.side_a)  // QUERY for team members
  const sideBIds = await resolveEntryParticipantIds(supabase, match.side_b)  // QUERY for team members

  // Query 4: Get division IDs
  const { data: tournamentDivisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id")
    .eq("tournament_id", tournamentId)

  // Query 5: Get other matches with assignments
  const { data: otherMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`...`)
    .in("division_id", divisionIds)

  // LOOP N TIMES - QUERY PER MATCH:
  for (const otherMatch of otherMatches || []) {
    // Queries 6+2*N: Resolve participant IDs for each other match
    const otherSideAIds = await resolveEntryParticipantIds(supabase, otherMatch.side_a)  // N queries
    const otherSideBIds = await resolveEntryParticipantIds(supabase, otherMatch.side_b)  // N queries

    // Queries 6+2*N+M: Look up conflicting player names
    if (overlap) {
      const { data: conflictPlayer } = await supabase  // M queries (per conflict found)
        .from(TABLE_NAMES.PARTICIPANTS)
        .select("display_name")
        .eq("id", conflictingId!)
        .single()
    }
  }

  // Similar loop for rest period violations (adds another N + M queries)
  for (const recentMatch of recentMatches || []) {
    // More resolveEntryParticipantIds calls
    // More participant lookups
  }
}
```

### Query Count Analysis

**Best case** (1 other match, no conflicts):
- 1 match fetch
- 2 team_members queries (if sides are teams)
- 1 divisions query
- 1 other matches query
- 2 team_members queries for other match
= **~7-9 queries**

**Realistic case** (10 other matches, 2 conflicts):
- 1 match fetch
- 2 team_members queries
- 1 divisions query
- 1 other matches query
- **20 team_members queries** (2 per match in loop)
- **2 participant lookups** (per conflict)
- 1 tournament fetch (rest window)
- 1 recent matches query
- **10 team_members queries** (for recent matches)
- **2+ participant lookups** (per rest violations)
= **~50+ queries** per court assignment!

### Root Cause: `resolveEntryParticipantIds()`

```typescript
async function resolveEntryParticipantIds(
  supabase: ServerSupabase,
  entry: { participant_id: string | null; team_id: string | null } | null
): Promise<string[]> {
  if (!entry) return []
  if (entry.participant_id) return [entry.participant_id]
  if (entry.team_id) {
    // PROBLEM: Query for every call, even if same team_id called multiple times
    const { data: members } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select("participant_id")
      .eq("team_id", entry.team_id)
    return members?.map(m => m.participant_id) || []
  }
  return []
}
```

Called **30+ times** in a typical conflict check with no memoization.

---

## Solution 1: Batch-Load Team Members (RECOMMENDED)

### Pattern: Pre-fetch all team_members at once

**File to modify:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/court-assignments.ts`

```typescript
/**
 * Batch-resolve participant IDs for multiple entries in one query.
 * Deduplicates team_ids and fetches all members at once.
 */
async function batchResolveEntryParticipantIds(
  supabase: ServerSupabase,
  entries: Array<{ participant_id: string | null; team_id: string | null } | null>
): Promise<Map<string | null, string[]>> {
  const result = new Map<string | null, string[]>()

  // Collect unique team_ids
  const teamIds = new Set<string>()
  for (const entry of entries) {
    if (entry?.team_id) teamIds.add(entry.team_id)
  }

  // Batch-load all team members at once
  if (teamIds.size > 0) {
    const { data: allMembers } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select("team_id, participant_id")
      .in("team_id", Array.from(teamIds))

    // Build a map: team_id -> [participant_ids]
    const teamMap = new Map<string, string[]>()
    for (const member of allMembers || []) {
      if (!teamMap.has(member.team_id)) {
        teamMap.set(member.team_id, [])
      }
      teamMap.get(member.team_id)!.push(member.participant_id)
    }

    // Populate result map
    for (const entry of entries) {
      if (entry?.participant_id) {
        result.set(`p:${entry.participant_id}`, [entry.participant_id])
      } else if (entry?.team_id && teamMap.has(entry.team_id)) {
        result.set(entry.team_id, teamMap.get(entry.team_id)!)
      }
    }
  }

  // Handle singles
  for (const entry of entries) {
    if (entry?.participant_id) {
      result.set(`p:${entry.participant_id}`, [entry.participant_id])
    }
  }

  return result
}

/**
 * Refactored checkConflicts using batch resolution
 */
async function checkConflicts(
  supabase: ServerSupabase,
  matchId: string,
  tournamentId: string
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = []

  // Query 1: Fetch the match with entries
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
    `)
    .eq("id", matchId)
    .single()

  if (!match) return warnings

  // OPTIMIZATION: Batch-resolve participant IDs upfront
  const teamIdMap = await batchResolveEntryParticipantIds(supabase, [match.side_a, match.side_b])
  const sideAIds = teamIdMap.get(match.side_a?.participant_id ? `p:${match.side_a.participant_id}` : match.side_a?.team_id) || []
  const sideBIds = teamIdMap.get(match.side_b?.participant_id ? `p:${match.side_b.participant_id}` : match.side_b?.team_id) || []
  const participantIds = [...sideAIds, ...sideBIds]

  if (participantIds.length === 0) return warnings

  // Query 2: Get division IDs for tournament
  const { data: tournamentDivisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id")
    .eq("tournament_id", tournamentId)

  const divisionIds = tournamentDivisions?.map(d => d.id) || []
  if (divisionIds.length === 0) return warnings

  // Query 3: Get other matches with assignments (including their entries)
  const { data: otherMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      court:bracket_blaze_courts(name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant_id, team_id,
        participant:bracket_blaze_participants(display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant_id, team_id,
        participant:bracket_blaze_participants(display_name)
      )
    `)
    .neq("id", matchId)
    .not("court_id", "is", null)
    .in("status", ["scheduled", "ready", "on_court"])
    .in("division_id", divisionIds)

  if (!otherMatches || otherMatches.length === 0) return warnings

  // OPTIMIZATION: Batch-resolve all other matches' entries at once
  const allOtherEntries: Array<{ participant_id: string | null; team_id: string | null } | null> = []
  for (const m of otherMatches) {
    allOtherEntries.push(m.side_a, m.side_b)
  }
  const otherTeamIdMap = await batchResolveEntryParticipantIds(supabase, allOtherEntries)

  // Now loop through matches without querying team_members
  for (let i = 0; i < otherMatches.length; i++) {
    const otherMatch = otherMatches[i]
    const otherSideAIds = otherTeamIdMap.get(otherMatch.side_a?.participant_id ? `p:${otherMatch.side_a.participant_id}` : otherMatch.side_a?.team_id) || []
    const otherSideBIds = otherTeamIdMap.get(otherMatch.side_b?.participant_id ? `p:${otherMatch.side_b.participant_id}` : otherMatch.side_b?.team_id) || []
    const otherParticipantIds = [...otherSideAIds, ...otherSideBIds]

    const overlap = participantIds.some(id => otherParticipantIds.includes(id))

    if (overlap) {
      const conflictingId = participantIds.find(id => otherParticipantIds.includes(id))
      // Use participant data already fetched in the match query
      const displayName = otherMatch.side_a?.participant_id === conflictingId
        ? otherMatch.side_a.participant?.display_name
        : otherMatch.side_b?.participant_id === conflictingId
        ? otherMatch.side_b.participant?.display_name
        : "A player"

      warnings.push({
        type: "player_overlap",
        severity: "error",
        message: `${displayName} is already assigned to ${otherMatch.court?.name}`,
      })
    }
  }

  // Similar optimization for rest period violations
  // Query 4: Get tournament rest window
  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("rest_window_minutes")
    .eq("id", tournamentId)
    .single()

  const restWindowMinutes = tournament?.rest_window_minutes || 15

  // Query 5: Get recent completed matches (with entries)
  const { data: recentMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
    `)
    .neq("id", matchId)
    .eq("status", "completed")
    .not("actual_end_time", "is", null)
    .in("division_id", divisionIds)

  if (!recentMatches || recentMatches.length === 0) {
    return warnings
  }

  // OPTIMIZATION: Batch-resolve recent matches
  const recentEntries: Array<{ participant_id: string | null; team_id: string | null } | null> = []
  for (const m of recentMatches) {
    recentEntries.push(m.side_a, m.side_b)
  }
  const recentTeamIdMap = await batchResolveEntryParticipantIds(supabase, recentEntries)

  for (let i = 0; i < recentMatches.length; i++) {
    const recentMatch = recentMatches[i]
    const recentSideAIds = recentTeamIdMap.get(recentMatch.side_a?.participant_id ? `p:${recentMatch.side_a.participant_id}` : recentMatch.side_a?.team_id) || []
    const recentSideBIds = recentTeamIdMap.get(recentMatch.side_b?.participant_id ? `p:${recentMatch.side_b.participant_id}` : recentMatch.side_b?.team_id) || []
    const recentParticipantIds = [...recentSideAIds, ...recentSideBIds]

    const overlap = participantIds.some(id => recentParticipantIds.includes(id))

    if (overlap && recentMatch.actual_end_time) {
      const endTime = new Date(recentMatch.actual_end_time)
      const now = new Date()
      const minutesSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60)

      if (minutesSinceEnd < restWindowMinutes) {
        const conflictingId = participantIds.find(id =>
          recentParticipantIds.includes(id)
        )

        // Would need another query to get participant name here
        // Or pre-fetch conflict participant names
        const { data: conflictPlayer } = await supabase
          .from(TABLE_NAMES.PARTICIPANTS)
          .select("display_name")
          .eq("id", conflictingId!)
          .single()

        const remainingRest = Math.ceil(restWindowMinutes - minutesSinceEnd)

        warnings.push({
          type: "rest_violation",
          severity: "warning",
          message: `${conflictPlayer?.display_name || "A player"} finished a match ${Math.floor(minutesSinceEnd)} minutes ago (needs ${remainingRest} more minutes rest)`,
        })
      }
    }
  }

  return warnings
}
```

### Query Count After Optimization

**Same realistic scenario** (10 other matches, 2 rest violations, 2 conflicts):
- 1 match fetch
- 1 batch team_members fetch (for match's 2 entries)
- 1 divisions query
- 1 other matches query
- 1 batch team_members fetch (for 10 other matches = up to 20 entries)
- 1 tournament fetch
- 1 recent matches query
- 1 batch team_members fetch (for recent matches)
- 2 participant lookups (conflicts, unavoidable)
= **~10 queries** (down from 50+)

**Savings: 80% reduction**

---

## Solution 2: Batch Updates Pattern (Already Partially Used)

### Current Issues

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:96-101`

```typescript
const updates = seededEntries
  .filter(e => unseededOriginal.find(orig => orig.id === e.id))
  .map(e => ({
    id: e.id,
    seed: e.seed,
  }))

// PROBLEM: Sequential updates in loop
for (const update of updates) {
  await supabase
    .from(TABLE_NAMES.ENTRIES)
    .update({ seed: update.seed })
    .eq("id", update.id)
}
```

### Solution: Use `.upsert()` or batch with transaction

**Best approach for Supabase: Use `upsert()` with batch**

```typescript
// Instead of:
for (const update of updates) {
  await supabase
    .from(TABLE_NAMES.ENTRIES)
    .update({ seed: update.seed })
    .eq("id", update.id)
}

// Use upsert for batch update:
if (updates.length > 0) {
  const { error } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .upsert(updates, { onConflict: 'id' })

  if (error) {
    console.error("Error batch updating entries:", error)
    return { error: error.message }
  }
}
```

### Other Batch Update Patterns in Code

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/services/standings-engine.ts:165-169` ✅ GOOD PATTERN

```typescript
// This uses .upsert() correctly (batch operation)
const { error: upsertError } = await supabase
  .from(TABLE_NAMES.STANDINGS)
  .upsert(upsertData, {
    onConflict: 'division_id,entry_id,round',
  })
```

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/entries.ts:186-191` ✅ GOOD PATTERN

```typescript
// Batch insert team members
const { error: membersError } = await supabase
  .from(TABLE_NAMES.TEAM_MEMBERS)
  .insert([
    { team_id: team.id, participant_id: participantId1 },
    { team_id: team.id, participant_id: participantId2 },
  ])
```

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:145-153` ❌ NEEDS FIXING

```typescript
// This loops over bye matches (inefficient)
const byeMatches = insertedMatches?.filter(m => m.side_b_entry_id === null) || []
for (const byeMatch of byeMatches) {
  await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      status: 'completed',
      winner_side: 'A',
      meta_json: { games: [], total_points_a: 0, total_points_b: 0, walkover: false, bye: true },
    })
    .eq("id", byeMatch.id)
}

// Should be:
if (byeMatches.length > 0) {
  const { error } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      status: 'completed',
      winner_side: 'A',
      meta_json: { games: [], total_points_a: 0, total_points_b: 0, walkover: false, bye: true },
    })
    .in("id", byeMatches.map(m => m.id))

  if (error) {
    console.error("Error auto-completing bye matches:", error)
    return { error: error.message }
  }
}
```

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:483-490` ❌ NEEDS FIXING

```typescript
// Sequential updates for next_match_id references
for (let i = 0; i < bracketMatches.length; i++) {
  const nextKey = (bracketMatches[i] as any)._next_match_key
  const nextSide = bracketMatches[i].next_match_side
  if (!nextKey || !nextSide) continue

  const nextMatchId = dbIdMap.get(nextKey)
  const currentMatchId = insertedMatches[i].id

  if (nextMatchId) {
    await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        next_match_id: nextMatchId,
        next_match_side: nextSide,
      })
      .eq("id", currentMatchId)
  }
}

// Should be (collect updates, then batch):
const nextMatchUpdates = []
for (let i = 0; i < bracketMatches.length; i++) {
  const nextKey = (bracketMatches[i] as any)._next_match_key
  const nextSide = bracketMatches[i].next_match_side
  if (!nextKey || !nextSide) continue

  const nextMatchId = dbIdMap.get(nextKey)
  const currentMatchId = insertedMatches[i].id

  if (nextMatchId) {
    nextMatchUpdates.push({
      id: currentMatchId,
      next_match_id: nextMatchId,
      next_match_side: nextSide,
    })
  }
}

if (nextMatchUpdates.length > 0) {
  const { error } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .upsert(nextMatchUpdates, { onConflict: 'id' })

  if (error) {
    console.error("Error updating next_match references:", error)
    return { error: error.message }
  }
}
```

---

## Solution 3: Existing Good Patterns (Reference)

### Pattern 1: Using `.in()` for Batch Reads

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/entries.ts:143-146`

```typescript
// Good: Fetch multiple participants in one query
const { data: participants } = await supabase
  .from(TABLE_NAMES.PARTICIPANTS)
  .select("id, display_name")
  .in("id", [participantId1, participantId2])
```

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/court-assignments.ts:95-96`

```typescript
// Good: Filter multiple status values
.in("status", ["scheduled", "ready", "on_court"])
```

### Pattern 2: Eager Loading with Joins

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:68-72`

```typescript
// Good: Fetch entries all at once with their participant relationships
const { data: entries, error: entriesError } = await supabase
  .from(TABLE_NAMES.ENTRIES)
  .select("*")
  .eq("division_id", divisionId)
```

**File:** `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/court-assignments.ts:50-58`

```typescript
// Good: Eager-load entry relationships
const { data: match } = await supabase
  .from(TABLE_NAMES.MATCHES)
  .select(`
    *,
    side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
    side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
  `)
  .eq("id", matchId)
  .single()
```

---

## Supabase API Limitations & Workarounds

### Limitation 1: No Native Batch-Read

**Problem:** Supabase doesn't have `.in()` for relationship traversal

```typescript
// THIS DOESN'T WORK in Supabase:
.in("team_id", [id1, id2])
  .select("*, team(*, members(*))")  // Can't .in() on relationship

// WORKAROUND: Fetch team_members separately with .in()
const { data: members } = await supabase
  .from(TABLE_NAMES.TEAM_MEMBERS)
  .select("team_id, participant_id")
  .in("team_id", Array.from(teamIds))  // This works
```

### Limitation 2: No Batch Update with Different Values

**Problem:** Can't update different records with different values in one call

```typescript
// THIS DOESN'T WORK:
.update([
  { id: "1", seed: 1 },
  { id: "2", seed: 2 },
])

// WORKAROUND: Use .upsert() with onConflict
const { error } = await supabase
  .from(TABLE_NAMES.ENTRIES)
  .upsert(
    [
      { id: "1", seed: 1 },
      { id: "2", seed: 2 },
    ],
    { onConflict: 'id' }
  )
```

### Limitation 3: No Batch Update with Conditions

**Problem:** Can't conditionally update multiple records with different logic

```typescript
// THIS DOESN'T WORK:
.in("id", [id1, id2])
  .update(/* complex conditional value */)

// WORKAROUND: Build array of updates and upsert
const updates = records.map(r => ({
  id: r.id,
  status: computeStatus(r),  // Different per record
}))

await supabase
  .from(TABLE_NAMES.MATCHES)
  .upsert(updates, { onConflict: 'id' })
```

---

## Implementation Priorities

### Priority 1: CRITICAL - Fix N+1 in checkConflicts()

- **Impact:** 80% query reduction per court assignment
- **Effort:** Medium (refactor resolveEntryParticipantIds + rebuild maps)
- **Files:**
  - `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/court-assignments.ts`

### Priority 2: HIGH - Batch bye match completion

- **Impact:** 10-100x reduction for bye-heavy tournaments
- **Effort:** Low (change loop to `.in()` + `.update()`)
- **Files:**
  - `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:145-153`
  - `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:344-354`

### Priority 3: MEDIUM - Batch seed updates

- **Impact:** 5-50x reduction during draw generation
- **Effort:** Low (change loop to `.upsert()`)
- **Files:**
  - `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:96-101`

### Priority 4: MEDIUM - Batch next_match_id updates

- **Impact:** 50-100x reduction for knockout bracket generation
- **Effort:** Medium (restructure loop logic)
- **Files:**
  - `/Users/sukrutgejji/marketing/bracket-blaze/lib/actions/draws.ts:483-490`

---

## Testing Strategy

### Unit Test: batchResolveEntryParticipantIds()

```typescript
describe("batchResolveEntryParticipantIds", () => {
  it("should resolve singles without team_members query", async () => {
    const entries = [
      { participant_id: "p1", team_id: null },
      { participant_id: "p2", team_id: null },
    ]
    const result = await batchResolveEntryParticipantIds(supabase, entries)
    expect(result.get("p:p1")).toEqual(["p1"])
    expect(result.get("p:p2")).toEqual(["p2"])
  })

  it("should batch-load team members with single query", async () => {
    const entries = [
      { participant_id: null, team_id: "t1" },
      { participant_id: null, team_id: "t2" },
    ]
    // Mock should show only 1 team_members query
    const result = await batchResolveEntryParticipantIds(supabase, entries)
    expect(result.get("t1")).toEqual(["p1", "p2"])
    expect(result.get("t2")).toEqual(["p3", "p4"])
  })

  it("should deduplicate team_ids", async () => {
    const entries = [
      { participant_id: null, team_id: "t1" },
      { participant_id: null, team_id: "t1" },
      { participant_id: null, team_id: "t1" },
    ]
    // Mock should show only 1 team_members query (not 3)
    const result = await batchResolveEntryParticipantIds(supabase, entries)
    // Assert single query was made
  })
})
```

### Integration Test: Court Assignment Query Count

```typescript
it("assignMatchToCourt should complete in <20 queries", async () => {
  const queryCount = await captureQueryCount(async () => {
    await assignMatchToCourt(matchId, courtId)
  })
  expect(queryCount).toBeLessThan(20)  // Was 50+ before optimization
})
```

---

## References & Patterns

### Pattern: Supabase Eager Loading (Used in codebase)
- **File:** `lib/actions/court-assignments.ts:50-58`
- **Usage:** Select with dot notation for relationships
- **Limit:** Only 1 level deep

### Pattern: Supabase `.in()` Filter (Used correctly)
- **Files:**
  - `lib/actions/entries.ts:146` (participant IDs)
  - `lib/actions/court-assignments.ts:95-96` (status)
  - `lib/services/standings-engine.ts:45` (entry statuses)

### Pattern: Supabase `.upsert()` (Used correctly)
- **File:** `lib/services/standings-engine.ts:165-169`
- **Usage:** Batch insert or update with conflict handling
- **Benefit:** Single network round-trip for many records

### Anti-pattern: Sequential Updates (Used incorrectly)
- **Files:**
  - `lib/actions/draws.ts:96-101` (seed updates)
  - `lib/actions/draws.ts:145-153` (bye matches)
  - `lib/actions/draws.ts:483-490` (next_match_id)

---

## Summary Table

| Issue | Current | Optimized | Savings | Effort |
|-------|---------|-----------|---------|--------|
| checkConflicts() | 50+ queries | ~10 queries | 80% | Medium |
| Bye match completion | 10-100 queries | 1 query | 99% | Low |
| Seed updates | 5-50 queries | 1 query | 98% | Low |
| Next match refs | 50-100 queries | 1 query | 98% | Medium |
| **TOTAL per tournament** | **~500+ queries** | **~100 queries** | **80%** | **Medium** |

---

## Implementation Checklist

- [ ] Create `batchResolveEntryParticipantIds()` utility function
- [ ] Refactor `checkConflicts()` to use batch resolution
- [ ] Update bye match completion to use `.in()` + single `.update()`
- [ ] Update seed batch updates to use `.upsert()`
- [ ] Update next_match_id batch updates to use `.upsert()`
- [ ] Add query count tests
- [ ] Benchmark before/after on realistic tournament (100+ entries, 10+ divisions)
- [ ] Document patterns in `/docs/solutions/`

