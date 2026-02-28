---
status: complete
priority: p2
issue_id: "026"
tags: [code-review, validation, registration]
dependencies: []
---

# No Email Format Validation in Registration Form

## Problem Statement

The registration form validates that email is non-empty (`!email.trim()`) but does not check that it's a valid email format. The HTML `type="email"` attribute provides browser-level validation but can be bypassed by programmatic submissions or form manipulation. Invalid emails stored in the players table will cause issues if email notifications are added later.

## Findings

- `components/register/registration-form.tsx:200` — `if (!email.trim()) return "Email is required"` — only checks non-empty
- The `<Input type="email">` at line 389 provides browser validation but is client-side only
- No server-side email validation in the RPC function
- SQL `bracket_blaze_players.email` column has no CHECK constraint

## Proposed Solutions

### Option A: Add basic email regex check in validateForm (Recommended)

```typescript
if (!email.trim()) return "Email is required"
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address"
```

- **Pros:** Catches obvious mistakes (no @, no domain), simple pattern
- **Cons:** Won't catch all invalid emails (no regex can), but catches common errors
- **Effort:** Small (5 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Email format is validated before submission
- [ ] Invalid emails show a clear error message
- [ ] Valid emails still work correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `components/register/registration-form.tsx:200`
