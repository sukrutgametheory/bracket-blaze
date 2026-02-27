---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, quality, cleanup]
dependencies: []
---

# Dead Code and YAGNI Cleanup

## Problem Statement

Several pieces of code in this PR are unused or built for hypothetical future needs. Removing them reduces maintenance burden and clarifies what is actually in use.

## Findings

1. **Dead code: `getUnlinkedParticipants()` server action** — `lib/actions/participants.ts` lines 164-175 is defined but never imported or called. The participants page at `app/tournaments/[id]/participants/page.tsx` line 48 filters inline instead: `typedParticipants.filter((p) => !p.player_id)`

2. **YAGNI: name index on players table** — `supabase/migrations/20250106000001_create_players_table.sql` lines 19-21 creates `idx_bracket_blaze_players_name` with comment "future use". No query in the codebase uses it. The index has ongoing write overhead on every INSERT/UPDATE.

3. **Persistent SQL normalization function** — `supabase/migrations/20250106000003_backfill_players_from_participants.sql` lines 5-37 creates `bracket_blaze_normalize_phone_e164()` as a permanent function, but it is only used within this migration. After backfill, all normalization goes through TypeScript. Should add `DROP FUNCTION` at end of migration.

4. **Redundant double phone normalization** — `lib/actions/participants.ts` line 186 calls `normalizePhone(rawPhone)`, then passes the result to `findOrCreatePlayer()` which calls `normalizePhone()` again on line 37 of `lib/actions/players.ts`.

## Proposed Solutions

### Option A: Remove all four items
- Delete `getUnlinkedParticipants` function (12 lines)
- Note: Cannot remove the name index from an already-applied migration — create a new migration to drop it
- Add `DROP FUNCTION bracket_blaze_normalize_phone_e164(TEXT);` in a new migration
- Remove the `normalizePhone()` call in `linkParticipantToPlayer` (1 line)
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] `getUnlinkedParticipants` removed from participants.ts
- [ ] Name index dropped via new migration
- [ ] SQL normalization function dropped via new migration
- [ ] No double normalization in link path
