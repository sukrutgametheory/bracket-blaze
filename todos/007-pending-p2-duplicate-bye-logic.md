---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, quality]
dependencies: []
---

# Duplicate Bye Auto-Completion Logic

## Problem Statement

Bye auto-completion logic is duplicated between `generateDraw` (R1) and `generateNextSwissRound` (R2+). Both contain nearly identical code that finds bye matches and marks them as completed. This violates DRY and creates a maintenance risk - a bug fix in one place could be missed in the other.

## Findings

- `lib/actions/draws.ts` - `generateDraw()`: Lines that find matches where `side_b_entry_id IS NULL` and update status to `completed` with `meta_json` containing bye flag
- `lib/actions/draws.ts` - `generateNextSwissRound()`: Same bye detection and completion logic duplicated

## Proposed Solutions

### Option A: Extract shared helper function (Recommended)
- Create `async function autoCompleteByes(supabase, matchIds)` that handles bye detection and completion
- Call from both `generateDraw` and `generateNextSwissRound`
- **Pros**: Single source of truth, easy to test
- **Cons**: Minor refactor
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Bye auto-completion logic exists in exactly one place
- [ ] Both R1 and R2+ draw generation use the shared helper
- [ ] Behavior unchanged (bye matches still auto-completed on generation)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | Bye completion duplicated in draws.ts |
