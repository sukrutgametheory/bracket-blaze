---
status: pending
priority: p3
issue_id: "028"
tags: [code-review, performance, ux, registration]
dependencies: []
---

# No Debouncing on Phone Lookup

## Problem Statement

The phone lookup fires on every `onBlur` event of the phone input. If a user tabs in and out repeatedly, or if mobile keyboards trigger blur events frequently, multiple RPC calls fire. While not critical, adding a simple debounce or dedup would reduce unnecessary database calls.

## Findings

- `components/register/registration-form.tsx:339` — `onBlur={handlePhoneLookup}` fires unconditionally
- No check for "has the phone value changed since last lookup"
- Performance Oracle identified this as an optimization opportunity

## Proposed Solutions

### Option A: Track last-looked-up phone value (Recommended)

Add a ref to track the last phone value that was looked up. Skip if unchanged:

```typescript
const lastLookedUpPhone = useRef("")
// In handlePhoneLookup:
if (normalized === lastLookedUpPhone.current) return
lastLookedUpPhone.current = normalized
```

- **Pros:** Simple, no timer complexity, prevents redundant calls
- **Cons:** Doesn't debounce rapid different values (rare edge case)
- **Effort:** Small (10 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Repeated blur with same phone value doesn't trigger multiple RPCs
- [ ] Changed phone value still triggers lookup

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `components/register/registration-form.tsx:339`
