# Supabase Query Patterns Reference

**Quick lookup guide for common Supabase patterns used in the codebase.**

---

## ✅ GOOD PATTERNS

### 1. Eager Loading Relationships

**When:** Need related data in one query
**Pattern:**
```typescript
const { data: match } = await supabase
  .from(TABLE_NAMES.MATCHES)
  .select(`
    *,
    court:bracket_blaze_courts(name),
    side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
    side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
  `)
  .eq("id", matchId)
  .single()
```

**Files:**
- `lib/actions/court-assignments.ts:50-58`
- `lib/actions/matches.ts:49-58`

**Pros:**
- Single network round-trip
- Avoids N+1 queries
- Clean data structure

**Cons:**
- Only 1 level deep (cannot nest further)
- Harder to follow for complex selects

---

### 2. Batch Reads with `.in()`

**When:** Querying multiple records by ID/value
**Pattern:**
```typescript
const { data: participants } = await supabase
  .from(TABLE_NAMES.PARTICIPANTS)
  .select("id, display_name")
  .in("id", [participantId1, participantId2])
```

**Files:**
- `lib/actions/entries.ts:143-146`
- `lib/actions/court-assignments.ts:95-96`

**Pros:**
- Much faster than individual queries
- Reduces network latency
- Simple to understand

**Cons:**
- Limited to direct column filtering (not relationships)
- Max array size depends on Supabase plan

---

### 3. Batch Inserts

**When:** Creating multiple records at once
**Pattern:**
```typescript
const { error: membersError } = await supabase
  .from(TABLE_NAMES.TEAM_MEMBERS)
  .insert([
    { team_id: team.id, participant_id: participantId1 },
    { team_id: team.id, participant_id: participantId2 },
  ])
```

**Files:**
- `lib/actions/entries.ts:186-191`
- `lib/actions/draws.ts:133-136` (matches)

**Pros:**
- Single query for many inserts
- All-or-nothing atomicity
- Cleaner code than loops

---

### 4. Batch Upsert (Insert or Update)

**When:** Creating or updating multiple records with conflict handling
**Pattern:**
```typescript
const { error: upsertError } = await supabase
  .from(TABLE_NAMES.STANDINGS)
  .upsert(upsertData, {
    onConflict: 'division_id,entry_id,round',
  })
```

**Files:**
- `lib/services/standings-engine.ts:165-169`

**Pros:**
- Handles both INSERT and UPDATE in one query
- Specify which columns determine conflicts
- Much faster than separate insert/update logic

**Cons:**
- Need to include all columns being updated
- onConflict specification can be tricky

---

### 5. Filtering on Relationships

**When:** Filtering by a foreign key relationship
**Pattern:**
```typescript
const { data: existingMembers } = await supabase
  .from(TABLE_NAMES.TEAM_MEMBERS)
  .select(`
    participant_id,
    team:bracket_blaze_teams!inner(division_id)
  `)
  .eq("team.division_id", divisionId)
  .in("participant_id", [participantId1, participantId2])
```

**Files:**
- `lib/actions/entries.ts:129-136`

**Pros:**
- Filter on related table without separate query
- `!inner` performs INNER JOIN (filters out nulls)
- Combines with `.in()` for batch filtering

**Cons:**
- Syntax is different from typical SQL
- Only works with foreign key relationships

---

## ❌ BAD PATTERNS (N+1 Queries)

### 1. Sequential Queries in Loop

**Problem:**
```typescript
for (const update of updates) {
  await supabase
    .from(TABLE_NAMES.ENTRIES)
    .update({ seed: update.seed })
    .eq("id", update.id)  // 1 query per update!
}
```

**Files:**
- `lib/actions/draws.ts:96-101` (seed updates)
- `lib/actions/draws.ts:145-153` (bye matches)
- `lib/actions/draws.ts:483-490` (next_match_id refs)

**Impact:** 5-100 queries instead of 1

**Fix:**
```typescript
// Use upsert for batch update
const { error } = await supabase
  .from(TABLE_NAMES.ENTRIES)
  .upsert(updates, { onConflict: 'id' })
```

---

### 2. Calling Query Function in Loop

**Problem:**
```typescript
for (const otherMatch of otherMatches || []) {
  const otherSideAIds = await resolveEntryParticipantIds(supabase, otherMatch.side_a)
  const otherSideBIds = await resolveEntryParticipantIds(supabase, otherMatch.side_b)
  // ... 2 queries per match
}
```

**Files:**
- `lib/actions/court-assignments.ts:98-101` (player overlap)
- `lib/actions/court-assignments.ts:143-146` (rest violations)

**Impact:** 50+ queries instead of 1-2

**Fix:**
```typescript
// Batch-load all team_members at once before loop
const teamIdMap = await batchResolveEntryParticipantIds(supabase, allEntries)

// Use pre-fetched data in loop (no queries)
for (const match of matches) {
  const sideAIds = teamIdMap.get(match.side_a?.team_id)
  const sideBIds = teamIdMap.get(match.side_b?.team_id)
}
```

---

### 3. Lazy Loading Deep Relationships

**Problem:**
```typescript
// ANTIPATTERN: Query 1 - fetch match
const { data: match } = await supabase.from("matches").select().single()

// ANTIPATTERN: Query 2 - fetch entry
const { data: entry } = await supabase
  .from("entries")
  .select()
  .eq("id", match.side_a_entry_id)

// ANTIPATTERN: Query 3 - fetch team members
const { data: members } = await supabase
  .from("team_members")
  .select()
  .eq("team_id", entry.team_id)
```

**Impact:** 3 queries instead of 1

**Fix:**
```typescript
// Use eager loading in initial select
const { data: match } = await supabase
  .from(TABLE_NAMES.MATCHES)
  .select(`
    *,
    side_a:bracket_blaze_entries!side_a_entry_id(
      participant_id,
      team:bracket_blaze_teams(
        bracket_blaze_team_members(participant_id)
      )
    )
  `)
  .eq("id", matchId)
  .single()
```

---

## 🎯 Decision Tree

**Should I batch?**

```
Do you need multiple related records?
├─ YES: Use eager loading (.)
│  └─ Can't fit in initial query?
│     ├─ YES: Fetch IDs first, then batch-load by ID with .in()
│     └─ NO: Eager load in select()
├─ NO: Single record query
   └─ Need to filter by relationship?
      ├─ YES: Use relationship filter with !inner
      └─ NO: Direct .eq() or .in() filter
```

---

## 🔧 Converting Loops to Batch Operations

### Pattern 1: Update Loop → Upsert

**Before:**
```typescript
for (const record of records) {
  await supabase
    .from("table")
    .update({ field: record.value })
    .eq("id", record.id)
}
```

**After:**
```typescript
const updates = records.map(r => ({
  id: r.id,
  field: r.value,
}))

await supabase
  .from("table")
  .upsert(updates, { onConflict: 'id' })
```

---

### Pattern 2: Conditional Update Loop → `.in()` + Batch

**Before:**
```typescript
for (const match of matches) {
  if (match.side_b_entry_id === null) {
    await supabase
      .from("matches")
      .update({ status: 'completed' })
      .eq("id", match.id)
  }
}
```

**After:**
```typescript
const matchIds = matches
  .filter(m => m.side_b_entry_id === null)
  .map(m => m.id)

if (matchIds.length > 0) {
  await supabase
    .from("matches")
    .update({ status: 'completed' })
    .in("id", matchIds)
}
```

---

### Pattern 3: Function Call Loop → Batch Fetch

**Before:**
```typescript
for (const entry of entries) {
  const participant = await getParticipant(entry.participant_id)
  // ... do something
}
```

**After:**
```typescript
const participantIds = entries
  .map(e => e.participant_id)
  .filter(Boolean)

const { data: participants } = await supabase
  .from("participants")
  .select()
  .in("id", participantIds)

const participantMap = new Map(
  participants.map(p => [p.id, p])
)

for (const entry of entries) {
  const participant = participantMap.get(entry.participant_id)
  // ... do something
}
```

---

## 📊 Query Cost Comparison

| Operation | Sequential | Batched | Savings |
|-----------|-----------|---------|---------|
| 10 inserts | 10 queries | 1 query | 90% |
| 50 updates | 50 queries | 1 query | 98% |
| 100 member lookups | 100 queries | 1-2 queries | 99% |
| 5 team member fetches per match × 10 matches | 50 queries | 1 query | 98% |

---

## 🚫 Supabase Limitations

| What You Want | What Works | Workaround |
|--------------|-----------|-----------|
| Batch read different relationships | SELECT where id IN (...) | Fetch each relationship separately with .in() |
| Batch update with different values | UPDATE where id IN (...) | Use .upsert() with full records |
| Nested relationship filtering | SELECT...WHERE related.field = X | Use !inner syntax or separate queries |
| Transactional batch operations | N/A | All operations are atomic at row level |

---

## 🔍 How to Spot N+1 in Code

**Red flags:**
1. `for` or `while` loop with `await` inside
2. Same table queried inside a loop
3. `.select()` inside a loop
4. Function that queries, called multiple times in a loop

**Example detection:**
```typescript
const matches = await fetchMatches()  // Query 1

// ❌ Red flag: Loop with await
for (const match of matches) {
  const entries = await fetchEntries(match.id)  // Query 2-N
  const participants = await fetchParticipants(entries)  // Query 2N-3N
}

// ✅ Better:
const matchIds = matches.map(m => m.id)
const allEntries = await supabase
  .from("entries")
  .select()
  .in("match_id", matchIds)

const participantIds = allEntries.map(e => e.participant_id)
const allParticipants = await supabase
  .from("participants")
  .select()
  .in("id", participantIds)
```

---

## 📚 Related Files

- **Implementation guide:** `docs/solutions/2026-02-22-n1-query-performance-analysis.md`
- **Example good patterns:**
  - `lib/actions/entries.ts` (batch inserts, `.in()` filters)
  - `lib/services/standings-engine.ts` (upsert patterns)
  - `lib/actions/court-assignments.ts` (eager loading)

