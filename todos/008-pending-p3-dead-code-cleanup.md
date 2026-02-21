---
status: pending
priority: p3
issue_id: "008"
tags: [code-review, quality]
dependencies: []
---

# ~66 LOC of Dead Code and Unused Exports

## Problem Statement

Several functions, types, and return values created during Phase 3 are never used by any caller. This adds confusion for future developers reading the code.

## Findings

- `lib/services/draw-generators/swiss-engine.ts`:
  - `recommendedSwissRounds()` - never called anywhere
  - Redundant even-number check before power-of-2 check in validation
- `lib/services/draw-generators/knockout-engine.ts`:
  - `getKnockoutRoundLabel()` - exported but never imported
  - `positionMap` return value from `generateKnockoutBracketStructure()` - never used by caller
- `lib/services/draw-generators/knockout-engine.ts`:
  - `_next_match_key` hack: temporary property cast to `any` on match objects - should be a separate Map/lookup structure instead

## Proposed Solutions

### Option A: Remove dead code, refactor _next_match_key (Recommended)
- Delete `recommendedSwissRounds`, `getKnockoutRoundLabel`
- Remove `positionMap` from return value
- Replace `_next_match_key` with a `Map<number, { matchId: string, side: string }>` lookup
- Remove redundant even-number check
- **Pros**: Cleaner code, no `any` cast needed for _next_match_key
- **Cons**: Minor refactor
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] No unused exported functions in Phase 3 code
- [ ] `_next_match_key` replaced with proper data structure
- [ ] Build still passes after cleanup

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | ~66 LOC dead code across Phase 3 files |
