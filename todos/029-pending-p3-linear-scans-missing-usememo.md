---
status: pending
priority: p3
issue_id: "029"
tags: [code-review, performance, typescript, registration]
dependencies: []
---

# Repeated Linear Scans and Missing useMemo in Registration Form

## Problem Statement

The registration form repeatedly calls `divisions.find()` in multiple locations (validation, submit, render), performing O(n) lookups each time. With typical tournament sizes (3-8 divisions), this is negligible, but creating a Map and using `useMemo` for derived state would be cleaner.

## Findings

- `divisions.find()` called in: `handleDivisionToggle`, `validateForm`, `handleSubmit`, `showDuprField`, render loop
- `existingDivisionIds` Set is recreated on every render (line 192)
- `showDuprField` is recomputed on every render (line 186)
- Performance Oracle and TypeScript Reviewer both flagged this

## Proposed Solutions

### Option A: Add useMemo for derived values

```typescript
const divisionsMap = useMemo(() => new Map(divisions.map(d => [d.id, d])), [divisions])
const existingDivisionIds = useMemo(() => new Set(existingEntries.map(e => e.division_id)), [existingEntries])
const showDuprField = useMemo(() =>
  Array.from(selectedDivisions).some(id => divisionsMap.get(id)?.sport === "pickleball"),
  [selectedDivisions, divisionsMap]
)
```

- **Pros:** Cleaner code, O(1) lookups, proper memoization
- **Cons:** Over-optimization for current scale
- **Effort:** Small (15 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Derived state is memoized
- [ ] No functional changes to form behavior

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Low priority — typical divisions count is 3-8 |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `components/register/registration-form.tsx:186,192`
