---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, performance]
dependencies: []
---

# Unbounded Queries in Conflict Detection

## Problem Statement

`checkConflicts` in `court-assignments.ts` queries all matches globally without scoping to the current tournament. The rest period check fetches ALL completed matches for a participant across all tournaments. As the platform grows, these queries will degrade performance significantly.

## Findings

- `lib/actions/court-assignments.ts` - `checkConflicts()`:
  - Fetches all `on_court` or `ready` matches to check player overlap - no tournament filter
  - Rest period query fetches all completed matches for a participant globally, then filters by `actual_end_time`
  - No indexes on the columns being filtered (`status`, `side_a_entry_id`, `side_b_entry_id`)

## Proposed Solutions

### Option A: Add tournament scoping to all queries (Recommended)
- Pass `tournamentId` to `checkConflicts`
- Join through `divisions` table to scope to tournament: `.eq('division.tournament_id', tournamentId)`
- Add composite index on `(status, division_id)` for match lookups
- **Pros**: Fixes the scaling issue, minimal code change
- **Cons**: Requires passing tournament context through
- **Effort**: Small
- **Risk**: Low

### Option B: Denormalize tournament_id onto matches table
- Add `tournament_id` column to matches for direct filtering
- **Pros**: Simpler queries, faster lookups
- **Cons**: Denormalization, migration needed
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] `checkConflicts` scoped to current tournament only
- [ ] Rest period check queries only the current tournament's matches
- [ ] Verified with EXPLAIN ANALYZE that queries use indexes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | Global match queries in conflict detection |
