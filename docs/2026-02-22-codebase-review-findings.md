# Codebase Review Findings

**Date:** 2026-02-22
**Scope:** Full codebase review — security, performance, architecture, type safety, data integrity

---

## CRITICAL (P1) — Must Fix

### 1. `createTournament` accepts client-supplied `userId` — auth bypass

**File:** `lib/actions/tournaments.ts:8`

```ts
export async function createTournament(data: TournamentFormData, userId: string) {
```

The `userId` is passed from the client. A malicious user can supply any UUID as `created_by`, becoming admin of a tournament they didn't create. Should call `requireAuth()` and use `user.id` from the session.

---

### 2. Thirteen server actions missing authentication entirely

**Files:**
- `lib/actions/courts.ts` — `createCourt`, `updateCourt`, `deleteCourt`
- `lib/actions/divisions.ts` — `createDivision`, `updateDivision`, `deleteDivision`
- `lib/actions/participants.ts` — `createParticipant`, `updateParticipant`, `deleteParticipant`
- `lib/actions/entries.ts` — `createEntry`, `createDoubleEntry`, `updateEntry`, `deleteEntry`

None of these call `requireAuth()`. They use `createClient()` directly, which returns a Supabase client with the cookie-based session but never validates the user or checks tournament ownership. RLS provides a safety net at the DB layer, but the server actions should also enforce auth to fail early and provide clear error messages.

---

### 3. No concurrent court assignment guard (race condition)

**File:** `lib/actions/court-assignments.ts:226-234`

Two TDs (or fast double-clicks) can assign different matches to the same court simultaneously. `checkConflicts` doesn't check if the court already has an assigned match — it only checks player overlaps. There's no DB-level unique constraint on `(court_id)` for active matches either.

**Impact:** Two matches assigned to the same physical court.

---

### 4. Entries deletable after draw generation

**File:** `components/entries/entry-list.tsx:298-305`

The "Remove" button is always rendered, even when `division.is_published` is `true`. The server action `deleteEntry` (`lib/actions/entries.ts:288`) has no `is_published` guard either.

**Impact:** Deleting an entry that's referenced by matches will either FK-cascade delete the matches (data loss) or fail with a foreign key violation depending on cascade settings.

---

### 5. Division/participant deletion without active match guards

**Files:**
- `lib/actions/divisions.ts:109` — `deleteDivision` deletes regardless of active matches
- `lib/actions/participants.ts:100` — `deleteParticipant` deletes regardless of active entries/matches

**Impact:** Cascading deletes could destroy in-progress match data mid-tournament.

---

### 6. `deleteAllMatches` has no status guard

**File:** `lib/actions/draws.ts:209-212`

```ts
const { error } = await supabase
  .from(TABLE_NAMES.MATCHES)
  .delete()
  .eq("division_id", divisionId)
```

Deletes all matches including those with status `on_court` or `pending_signoff`. A live match being scored by a referee would vanish mid-game.

---

## HIGH (P2) — Should Fix

### 7. Overly permissive standings RLS policy

**File:** `supabase/migrations/20250101000003_rls_policies_prefixed.sql:292-295`

```sql
CREATE POLICY "System can manage standings"
    ON bracket_blaze_standings FOR ALL
    USING (true)
    WITH CHECK (true);
```

Any authenticated user can INSERT, UPDATE, or DELETE standings for any division. Should be scoped to tournament admin.

---

### 8. Participant PII visible to all users

**File:** `supabase/migrations/20250101000003_rls_policies_prefixed.sql:106-107`

```sql
CREATE POLICY "Anyone can view participants"
    ON bracket_blaze_participants FOR SELECT
    USING (true);
```

Exposes `email` and `phone` fields to every authenticated user across all tournaments. Should restrict PII columns or scope SELECT to tournament participants/admins.

---

### 9. Participant INSERT allows any authenticated user for any tournament

**File:** `supabase/migrations/20250101000003_rls_policies_prefixed.sql:109-111`

```sql
CREATE POLICY "Authenticated users can create participants"
    ON bracket_blaze_participants FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
```

Any authenticated user can insert participants into any tournament. Should be scoped to tournament admin via `bracket_blaze_is_tournament_admin(tournament_id)`.

---

### 10. No guard for entry creation after draw generation

**File:** `lib/actions/entries.ts:7-88`

`createEntry` doesn't check `division.is_published`. The UI disables the button but the server action is unprotected. A direct API call can add entries after the draw is generated, creating orphaned entries not part of any match.

---

### 11. `as any` epidemic — 29 instances

**Key files:**
- `components/control-center/control-center-client.tsx:27-30` — `matches: any[]`, `draws: { state_json: any }[]`, `entries: any[]`
- `lib/actions/draws.ts:105` — `let matches: any[] = []`
- `lib/actions/draws.ts:108,270,420` — `const rulesJson = division.rules_json as any`
- `lib/actions/entries.ts:278,318` — `(entry.division as any).tournament_id`

The `any` types in `ControlCenterClient` props cascade through the entire component tree (ReadyQueue, CourtGrid, RoundManagement, ResultsSection), eliminating type checking for ~1000 lines.

---

### 12. `Participant` interface missing `tournament_id`

**File:** `types/database.ts:74-82`

The DB table has `tournament_id` but the TypeScript interface doesn't include it. Code that reads `participant.tournament_id` silently gets `undefined`.

---

### 13. `divisionFormSchema` not used server-side

**File:** `lib/actions/divisions.ts:11`

```ts
const validatedData = divisionSchema.parse(data)
```

Uses the base `divisionSchema` which doesn't validate format-specific fields (swiss_rounds, groups_count, etc.). The extended `divisionFormSchema` with cross-field validations is only used client-side.

---

### 14. `clearCourt` dead code — unreachable status guards

**File:** `lib/actions/court-assignments.ts:299-311`

The query on line 288 filters to `IN ('scheduled', 'ready', 'on_court', 'pending_signoff')`, so the status checks for `completed` and `walkover` on lines 300-301 can never trigger. The `on_court` and `pending_signoff` guards on lines 305-311 ARE reachable and correct — only the completed/walkover guards are dead code.

---

### 15. `window.location.reload()` on Court TV and Live Portal

**Files:**
- `components/court-tv/court-tv-client.tsx:99`
- `components/live-portal/live-portal-client.tsx:89`

Every `postgres_changes` UPDATE event triggers a full page reload. With Realtime subscriptions having no filter, this means ANY match update across ALL tournaments causes a reload on every open Court TV and Live Portal tab.

---

### 16. Realtime subscription has no filter — receives all match updates

**Files:**
- `components/court-tv/court-tv-client.tsx:93-97`
- `components/live-portal/live-portal-client.tsx:83-87`

```ts
{
  event: "UPDATE",
  schema: "public",
  table: "bracket_blaze_matches",
}
```

No `filter` parameter. Every match update across every tournament hits every open client. Should filter by `division_id=in.(id1,id2,...)`.

---

### 17. Google Fonts `<link>` tag in component JSX

**File:** `components/court-tv/court-tv-client.tsx:127-129`

```tsx
<link
  href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap"
  rel="stylesheet"
/>
```

Re-added to the DOM on every render. Should be in `layout.tsx` or `next/font`.

---

## MEDIUM (P3) — Improve When Possible

### 18. N+1 queries in `checkConflicts`

**File:** `lib/actions/court-assignments.ts:98-120, 143-174`

For each "other match" on a court, the function calls `resolveEntryParticipantIds` which may query `team_members`. Then for each conflict found, it queries `participants` for the display name. With 20 courts and 10 doubles matches each, this could be 200+ individual DB queries per assignment.

---

### 19. Unbounded rest violation query

**File:** `lib/actions/court-assignments.ts:131-141`

```ts
.eq("status", "completed")
.not("actual_end_time", "is", null)
.in("division_id", divisionIds)
```

Fetches ALL completed matches in the tournament, ever. Should add a time filter: `.gte("actual_end_time", cutoffTime)` where cutoff = now minus rest window.

---

### 20. Sequential standings calculation blocks page load

**File:** `app/tournaments/[id]/control-center/page.tsx:90-95`

```ts
for (const division of divisions || []) {
  const { standings } = await calculateStandings(division.id, currentRound)
  standingsMap[division.id] = standings || []
}
```

Each division's standings are calculated sequentially. With 3 divisions, this triples the page load time. Should use `Promise.all()`.

---

### 21. Sequential seed updates in draw generation

**File:** `lib/actions/draws.ts:96-101`

```ts
for (const update of updates) {
  await supabase
    .from(TABLE_NAMES.ENTRIES)
    .update({ seed: update.seed })
    .eq("id", update.id)
}
```

Each seed is updated individually. Could batch with a single `.upsert()` or use `Promise.all()`.

---

### 22. Sequential knockout `next_match_id` updates

**File:** `lib/actions/draws.ts:474-491`

Each knockout match's `next_match_id` is updated in a sequential loop. Could be parallelized with `Promise.all()`.

---

### 23. No tournament status validation on mutations

None of the server actions check `tournament.status`. You can generate draws, assign courts, and score matches even when the tournament is `paused`, `completed`, or `cancelled`.

---

### 24. Round 1 bye goes to middle seed instead of lowest

**File:** `lib/services/draw-generators/swiss-engine.ts:90`

```ts
const byeEntry = sortedEntries[pairCount]  // middle entry
```

In a 7-player tournament with seeds 1-7, the bye goes to seed 4 (the middle), not seed 7 (the lowest). Standard Swiss practice gives the bye to the lowest-ranked player.

---

### 25. Auto-seed assignment depends on insertion order

**File:** `lib/services/draw-generators/swiss-engine.ts:117`

```ts
return entries.map(entry => {
  if (entry.seed !== null) return entry
  // ...assigns next available seed
})
```

Unseeded entries get seeds based on their position in the `entries` array (which is DB insertion order). If player "Alice" was registered before "Bob", Alice always gets the higher seed. Should shuffle unseeded entries or sort by some attribute.

---

### 26. 3-way float fallback can leave player unpaired

**File:** `lib/services/draw-generators/swiss-engine.ts:304-329`

When the last bracket has an odd player and there's no next bracket, it undoes the last match and creates a 3-way pool. The third player becomes an extra bye. But if `byeEntryId` is already set (odd total), this second bye is silently dropped (line 325: `if (!byeEntryId)`) — meaning a player gets neither a match nor a bye.

---

### 27. `courtMatchMap` silently drops duplicate matches per court

**File:** `components/control-center/court-grid.tsx`

```ts
const courtMatchMap = new Map(matches.map(m => [m.court_id, m]))
```

If two matches share the same `court_id` (due to the race condition in finding #3, or a completed match not yet cleared), only the last one in the array is kept. The other is silently hidden from the TD.

---

### 28. `createDoubleEntry` not in a DB transaction

**File:** `lib/actions/entries.ts:170-218`

Creates team, team_members, and entry as three separate operations with manual rollback on failure. If the process crashes between creating team_members and creating the entry, orphaned teams/members remain in the DB.

---

### 29. Missing error boundaries

No React error boundaries around the Control Center, Court TV, or Live Portal. An unhandled exception in any child component crashes the entire page.

---

### 30. Participant UPDATE policy too restrictive

**File:** `supabase/migrations/20250101000003_rls_policies_prefixed.sql:113-115`

```sql
CREATE POLICY "Users can update own participant profile"
    ON bracket_blaze_participants FOR UPDATE
    USING (user_id = auth.uid());
```

Only the participant themselves (via `user_id`) can update their profile. But participants are created by the TD with `user_id = null`. The TD's `updateParticipant` server action works only because the Supabase server client bypasses RLS — but if RLS is enforced on the server client, this breaks.

---

### 31. No DELETE policy for participants

**File:** `supabase/migrations/20250101000003_rls_policies_prefixed.sql`

There's no DELETE policy for `bracket_blaze_participants`. `deleteParticipant` only works if RLS is bypassed.

---

## LOW (P4) — Nice to Have

### 32. Unused TypeScript interfaces

**File:** `types/database.ts`

`MatchWithDetails`, `DivisionWithTournament`, `StandingWithEntry`, `EntryWithParticipant` are defined but never imported anywhere. Consider removing or actually using them to replace `any` types.

---

### 33. Unused TABLE_NAMES entries

**File:** `types/database.ts:30-31`

`OFFICIAL_ASSIGNMENTS` and `CHECKINS` are defined but never used in any query.

---

### 34. Unused export `recommendedSwissRounds`

**File:** `lib/services/draw-generators/swiss-engine.ts:169`

Exported but never imported anywhere.

---

### 35. `SwissEntry` interface includes `participant_id` but entries can have `team_id` instead

**File:** `lib/services/draw-generators/swiss-engine.ts:15-20`

```ts
export interface SwissEntry {
  id: string
  participant_id: string  // not nullable, but entries can have team_id instead
  seed: number | null
  status: string
}
```

The `participant_id` field should be `string | null` and a `team_id` field should be added to match the `Entry` type.

---

### 36. `rules_json` accepts arbitrary data with no size limits

**File:** `lib/validations/tournament.ts:23`

```ts
rules_json: z.record(z.string(), z.any()),
```

No maximum size or depth restriction. A malicious payload could be arbitrarily large.

---

### 37. Hardcoded `estimated_duration_minutes` default

Matches are created with `estimated_duration_minutes: 20` hardcoded in the swiss engine, but there's no way for TDs to configure this per-division or per-sport.

---

### 38. Court TV `<style>` tag in JSX

**File:** `components/court-tv/court-tv-client.tsx:130-161`

Inline `<style>` tag is re-injected on every render. Should use CSS modules or Tailwind utility classes.

---

### 39. Scoring token has no expiry or rate limiting

**File:** `lib/actions/scoring-token.ts` (referenced in control-center-client)

The scoring token is a UUID stored in the tournament record. It never expires and there's no rate limiting on the scoring API endpoints that use it. A leaked token grants permanent scoring access.

---

### 40. `divisionIds` array guard uses `['none']` placeholder

**File:** `app/tournaments/[id]/control-center/page.tsx:78`

```ts
.in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])
```

Supabase `.in()` with an empty array would return all rows. The `['none']` workaround works but is fragile — should guard with an early return instead.

---

### 41. No loading states on page navigations

The Control Center page (`page.tsx`) does all data fetching server-side with no streaming/suspense. With the sequential standings calculation (#20), this can result in multi-second blank screens.

---

### 42. `matches.ts` re-fetches match in `advanceKnockoutWinner`

**File:** `lib/actions/matches.ts:485-489`

`advanceKnockoutWinner` re-queries the match that `finalizeMatch` already had. The `next_match_id` and `next_match_side` could be passed as parameters instead.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL (P1) | 6 |
| HIGH (P2) | 11 |
| MEDIUM (P3) | 14 |
| LOW (P4) | 11 |
| **Total** | **42** |

## Recommended Fix Order

1. **Auth fixes** (P1 #1-2): Add `requireAuth()` to all 13 unprotected server actions, fix `createTournament` to use session user
2. **Data integrity guards** (P1 #3-6): Add `is_published`/active-match guards, concurrent court assignment protection
3. **RLS fixes** (P2 #7-9): Fix standings and participant policies
4. **Type safety** (P2 #11-12): Fix `Participant` interface, replace critical `any` types
5. **Performance** (P3 #18-22): Fix N+1 queries, parallelize standings, add time filter to rest query
6. **Realtime** (P2 #15-16): Add division filter to subscriptions, replace `window.location.reload()` with state updates
