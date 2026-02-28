---
status: complete
priority: p2
issue_id: "025"
tags: [code-review, security, data-integrity, registration]
dependencies: []
---

# Anon Registration Overwrites Existing Player display_name and email

## Problem Statement

The `bracket_blaze_register_for_tournament` RPC uses `ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email` for the registrant's player record. This means anyone who knows a player's phone number can overwrite their `display_name` and `email` in the global players table simply by submitting the registration form. This is a data integrity concern — a player's name could be changed to something offensive or incorrect by anyone.

Note: This is related to existing todo #016 (last-write-wins overwrites all fields), but this is the specific anon-facing vector introduced by the registration feature.

## Findings

- Registration RPC uses last-write-wins for the registrant's own record
- Partner records correctly use COALESCE (fill-NULLs-only) pattern — safer
- The phone lookup RPC returns existing player data, so the form pre-fills with current values
- Risk: Someone enters a known phone, changes the name, submits — name is overwritten globally
- Existing todo #016 covers the general pattern; this is the public-facing attack surface

## Proposed Solutions

### Option A: Use COALESCE for registrant too (Recommended)

Change the registrant's INSERT to match the partner pattern:

```sql
INSERT INTO bracket_blaze_players (phone, display_name, email, dupr_id)
VALUES (v_phone, p_display_name, p_email, p_dupr_id)
ON CONFLICT (phone) DO UPDATE SET
  display_name = COALESCE(bracket_blaze_players.display_name, EXCLUDED.display_name),
  email = COALESCE(bracket_blaze_players.email, EXCLUDED.email),
  dupr_id = COALESCE(EXCLUDED.dupr_id, bracket_blaze_players.dupr_id);
```

- **Pros:** Prevents overwriting existing player data, matches partner pattern
- **Cons:** Returning players can't update their name/email through registration form
- **Effort:** Small (15 min)
- **Risk:** Low — returning players would need TD to update their info

### Option B: Allow update only if name matches existing (loosely)

Only update if the submitted name is similar to the existing name (e.g., case-insensitive match), treating it as the same person updating their own record.

- **Pros:** Allows legitimate self-updates
- **Cons:** Complex, fuzzy matching is fragile
- **Effort:** Medium
- **Risk:** Medium

## Acceptance Criteria

- [ ] Existing player records cannot have display_name overwritten by anonymous registration
- [ ] New players still get their name/email stored correctly
- [ ] DUPR ID can still be filled if previously null

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Related to #016 but distinct attack surface |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- Related: todos/016-pending-p2-last-write-wins-overwrites-all-fields.md
