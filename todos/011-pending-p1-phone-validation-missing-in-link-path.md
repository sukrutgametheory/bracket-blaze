---
status: complete
priority: p1
issue_id: "011"
tags: [code-review, security, validation]
dependencies: []
---

# Phone Validation Missing in Backfill/Link Path

## Problem Statement

The `linkParticipantToPlayer` server action and the backfill modal path normalize phone numbers via `normalizePhone()` but never validate the result against `isValidE164()`. The `normalizePhone()` function silently returns invalid E.164 strings for short or malformed inputs (e.g., "123" becomes "+123") instead of throwing. This allows malformed phone numbers to be written to both `bracket_blaze_players` and `bracket_blaze_participants` tables via the backfill flow.

## Findings

- `lib/utils/phone.ts` lines 42-44: The `else` branch prepends `+` to any digit string without validation. JSDoc on line 16 claims `@throws Error` but the function never throws.
- `lib/actions/participants.ts` line 186: `linkParticipantToPlayer` calls `normalizePhone(rawPhone)` but does NOT call `isValidE164()` before writing to DB
- `components/participants/backfill-modal.tsx` lines 55-56: Client-side validation only checks `phone.length < 7`, not E.164 format
- `lib/validations/tournament.ts` line 79: The Zod schema chains `.refine(isValidE164)` AFTER `.transform(normalizePhone)` — but this validation only runs in the `createParticipant` path, not in `linkParticipantToPlayer`
- `lib/actions/players.ts` line 37: `findOrCreatePlayer` also normalizes but does not validate

## Proposed Solutions

### Option A: Add validation in linkParticipantToPlayer (Recommended)
- Add `isValidE164` check after `normalizePhone` in `linkParticipantToPlayer`
- Return error if validation fails
```typescript
const phone = normalizePhone(rawPhone)
if (!isValidE164(phone)) {
  return { error: "Invalid phone number format" }
}
```
- Also add to `findOrCreatePlayer` as defense-in-depth
- Fix JSDoc on `normalizePhone` (remove `@throws` claim)
- **Pros**: Catches invalid phones before they reach the database
- **Cons**: Could reject edge-case phone formats that were previously accepted
- **Effort**: Small (add 3-line check in 2 functions)
- **Risk**: Low

### Option B: Make normalizePhone throw on invalid results
- After normalization, check `isValidE164` and throw if invalid
- All call sites already have try/catch
- **Pros**: Single point of enforcement, impossible to skip validation
- **Cons**: Changes the function contract — may break existing callers that expect it to always return a string
- **Effort**: Small
- **Risk**: Low-Medium (need to verify all call sites handle throws)

## Acceptance Criteria
- [ ] `linkParticipantToPlayer` validates E.164 format before database write
- [ ] `findOrCreatePlayer` validates E.164 format before RPC call
- [ ] JSDoc on `normalizePhone` accurately reflects behavior
- [ ] Backfill modal shows clear error for invalid phone formats
- [ ] No malformed phone numbers can reach the database through any code path
