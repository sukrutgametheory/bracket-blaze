---
status: complete
priority: p1
issue_id: "012"
tags: [code-review, security, validation]
dependencies: []
---

# updateParticipant Drops Zod Validation Entirely

## Problem Statement

The `updateParticipant` server action was modified to accept `Omit<ParticipantFormData, "phone">` (excluding phone since it is immutable). However, the Zod `participantSchema.parse()` call that previously validated input was removed entirely. Raw, unvalidated data now goes directly to the Supabase `.update()` call. Server actions are trust boundaries — any client can call them with arbitrary data.

## Findings

- `lib/actions/participants.ts` lines 74-126: `updateParticipant` takes raw `data` parameter and passes `data.display_name`, `data.club`, `data.email` directly to `.update()` without any validation
- Previously (on main branch), this function called `participantSchema.parse(data)` for validation
- The existing `participantSchema` now requires phone with E.164 transform, making it unsuitable for updates
- No separate `updateParticipantSchema` exists
- The global player update (line 107-116) also uses raw unvalidated data

## Proposed Solutions

### Option A: Create updateParticipantSchema (Recommended)
- Create a new Zod schema specifically for participant updates (without phone)
```typescript
export const updateParticipantSchema = z.object({
  display_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  club: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
})
```
- Use it in `updateParticipant`:
```typescript
const validatedData = updateParticipantSchema.parse(data)
```
- **Pros**: Validates input at the trust boundary, reuses Zod patterns
- **Cons**: One more schema to maintain
- **Effort**: Small (5 lines)
- **Risk**: Low

### Option B: Use participantSchema.omit()
- `const updateParticipantSchema = participantSchema.omit({ phone: true })`
- **Pros**: DRY, derived from existing schema
- **Cons**: The `.omit()` operates on the final schema which includes the phone transform — need to verify this works correctly
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] `updateParticipant` validates all input fields via Zod before writing to database
- [ ] display_name is validated (min 2, max 100 chars)
- [ ] email is validated as email format when provided
- [ ] club is validated (max 100 chars) when provided
- [ ] Global player update also uses validated data
