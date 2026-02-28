---
status: complete
priority: p1
issue_id: "023"
tags: [code-review, security, validation, registration]
dependencies: []
---

# No E.164 Validation on Phone in Registration Submit Handler

## Problem Statement

In `components/register/registration-form.tsx`, the `handleSubmit` function calls `normalizePhone(phone)` at line 231 without a try/catch or E.164 validation check. If `normalizePhone` returns a malformed string (e.g. user enters letters or special characters), the RPC is called with invalid data. The phone lookup handler at line 90 correctly validates with `isValidE164`, but the submit path does not.

Additionally, partner phone numbers at line 242 are normalized without validation — a partner phone that fails normalization silently sends garbage to the database.

## Findings

- `components/register/registration-form.tsx:231` — `const normalized = normalizePhone(phone)` — no try/catch, no `isValidE164` check
- `components/register/registration-form.tsx:242` — `partner_phone: normalizePhone(partner.phone)` — same issue for partner phones
- `components/register/registration-form.tsx:90-103` — phone lookup correctly wraps in try/catch and validates E.164
- The `validateForm` function only checks `phone.length < 7` — does not validate format
- SQL function has E.164 format check via `bracket_blaze_normalize_phone_e164` but error messages would be cryptic RPC failures

## Proposed Solutions

### Option A: Add validation to validateForm (Recommended)

Extend `validateForm` to normalize and validate both player and partner phones:

```typescript
const validateForm = (): string | null => {
  // ... existing checks ...
  try {
    const norm = normalizePhone(phone)
    if (!isValidE164(norm)) return "Please enter a valid phone number"
  } catch {
    return "Please enter a valid phone number"
  }

  for (const divId of selectedDivisions) {
    const div = divisions.find((d) => d.id === divId)
    if (div?.play_mode === "doubles") {
      const partner = partnerFields[divId]
      // ... existing name check ...
      try {
        const partnerNorm = normalizePhone(partner.phone)
        if (!isValidE164(partnerNorm)) return `Invalid partner phone for ${div.name}`
      } catch {
        return `Invalid partner phone for ${div.name}`
      }
    }
  }
  return null
}
```

- **Pros:** Catches invalid phones before RPC call, consistent with lookup handler pattern, clear user-facing error messages
- **Cons:** None
- **Effort:** Small (15 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Player phone is validated as E.164 before submit
- [ ] Partner phones are validated as E.164 before submit
- [ ] Invalid phones show clear error messages
- [ ] Valid phone numbers still work correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Submit path diverged from lookup path validation |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `components/register/registration-form.tsx:231,242`
