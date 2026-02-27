---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, data-integrity]
dependencies: []
---

# Phone Immutability Enforced Only at Application Layer

## Problem Statement

Phone number immutability (the canonical identity key) is enforced only in the TypeScript layer — `updateParticipant` omits phone from the update payload and the UI makes the field read-only. There is no database-level trigger preventing a direct `UPDATE bracket_blaze_players SET phone = '...'` or `UPDATE bracket_blaze_participants SET phone = '...'` via Supabase client, SQL console, or future code paths.

## Findings

- `lib/actions/participants.ts` line 74: `updateParticipant` accepts `Omit<ParticipantFormData, "phone">` — TypeScript-only enforcement
- `components/participants/participant-dialog.tsx` lines 203-204: Phone input is `disabled` and `readOnly` in edit mode — UI-only enforcement
- No Postgres trigger prevents phone column changes on `bracket_blaze_players` or `bracket_blaze_participants`
- The UPDATE RLS policy on `bracket_blaze_players` allows any authenticated user to modify phone (if they bypass the app layer)

## Proposed Solutions

### Option A: Add Postgres trigger on bracket_blaze_players (Recommended)
```sql
CREATE OR REPLACE FUNCTION bracket_blaze_prevent_phone_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.phone IS DISTINCT FROM NEW.phone THEN
        RAISE EXCEPTION 'Phone number cannot be changed after creation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_player_phone_change
    BEFORE UPDATE ON bracket_blaze_players
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_prevent_phone_change();
```
- **Pros**: Database-level enforcement, impossible to bypass regardless of access method
- **Cons**: Prevents any phone correction (would require DELETE + INSERT)
- **Effort**: Small (single migration)
- **Risk**: Low

## Acceptance Criteria
- [ ] Direct SQL UPDATE to bracket_blaze_players.phone is blocked by trigger
- [ ] The trigger raises a clear error message
- [ ] Normal player updates (name, email, club) still work
- [ ] Application-layer phone immutability still in place as first line of defense
