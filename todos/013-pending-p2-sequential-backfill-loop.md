---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, performance]
dependencies: []
---

# Sequential Backfill Loop Freezes UI for Large Participant Counts

## Problem Statement

The backfill modal's `handleSaveAll` function processes unlinked participants sequentially in a `for...of` loop with `await`. Each participant requires 2 database round trips (RPC find-or-create + UPDATE participant). With 9 participants this takes ~900ms, but at 100 participants it would freeze the UI for ~10 seconds.

## Findings

- `components/participants/backfill-modal.tsx` lines 54-74: `for (const participant of unlinkedParticipants) { const result = await linkParticipantToPlayer(...) }`
- Each `linkParticipantToPlayer` call is independent — different participant, potentially different phone
- No parallelism, no batching, no progress indication beyond "Saving..."
- Partial failure leaves committed records with no way to retry only the failures

## Proposed Solutions

### Option A: Use Promise.allSettled (Recommended)
- Replace the `for...of` loop with `Promise.allSettled()` to parallelize all calls
- Each operation is independent so concurrency is safe
- The `INSERT ON CONFLICT` in the RPC handles duplicate phone races correctly
- **Pros**: Reduces wall-clock time from O(n) to O(1) in terms of round trips
- **Cons**: More concurrent connections to Supabase (bounded by connection pool)
- **Effort**: Small (restructure the loop into a map + allSettled)
- **Risk**: Low — operations are independent

## Acceptance Criteria
- [ ] Backfill operations run in parallel, not sequentially
- [ ] Error handling still tracks which participants failed
- [ ] Success/failure counts are correctly reported in toast
- [ ] UI remains responsive during the operation
