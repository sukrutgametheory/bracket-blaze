---
status: pending
priority: p3
issue_id: "009"
tags: [code-review, quality, typescript]
dependencies: ["004"]
---

# DrawState Interface Duplicated Locally in Component

## Problem Statement

`round-management.tsx` defines a local `DrawState` interface that duplicates the shape of the JSONB data stored in `bracket_blaze_draws.state_json`. This should be a shared type in `types/database.ts` so all consumers use the same definition.

## Findings

- `components/control-center/round-management.tsx:9-16` - local `DrawState` interface
- Same shape is implicitly used in `lib/actions/draws.ts` when writing to `state_json`
- No shared type exists in `types/database.ts`

## Proposed Solutions

### Option A: Promote to shared type (Recommended)
- Add `DrawState` interface to `types/database.ts`
- Import in `round-management.tsx` and `draws.ts`
- **Pros**: Single source of truth
- **Cons**: None
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] `DrawState` defined once in `types/database.ts`
- [ ] All files import the shared type
- [ ] Local definition removed from `round-management.tsx`

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | DrawState duplicated locally |
