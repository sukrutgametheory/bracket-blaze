---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, performance]
dependencies: []
---

# Sequential N+1 Write Patterns in Draw Generation

## Problem Statement

Draw generation in `draws.ts` performs sequential `await` calls inside loops for seed updates and knockout match linkage. For a 32-player division, this means 32+ sequential DB round trips for seed updates alone.

## Findings

- `lib/actions/draws.ts` - `generateDraw()`:
  - Seed updates: loops through entries with individual `await supabase.update()` calls
  - Knockout match insertion followed by individual `next_match_id` linkage updates
- `lib/actions/draws.ts` - `generateKnockoutDraw()`:
  - Sequential match insertions then sequential linkage updates
- These patterns are O(n) round trips where a single batch update would be O(1)

## Proposed Solutions

### Option A: Batch operations with Promise.all (Recommended)
- Collect all seed updates and run via `Promise.all()`
- Use a single RPC call or bulk update for knockout match linkage
- **Pros**: Reduces N round trips to 1, significant speedup for large draws
- **Cons**: Error handling slightly more complex with Promise.all
- **Effort**: Small
- **Risk**: Low

### Option B: Use Supabase RPC for batch operations
- Create a Postgres function for batch seed updates
- **Pros**: Single DB call, atomic
- **Cons**: More complex to maintain
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] Seed updates batched (not sequential per-entry)
- [ ] Knockout match linkage batched
- [ ] Draw generation completes in constant number of DB round trips (not proportional to player count)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | Sequential awaits in loops for seed/match updates |
