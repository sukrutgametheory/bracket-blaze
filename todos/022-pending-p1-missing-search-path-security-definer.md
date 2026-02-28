---
status: complete
priority: p1
issue_id: "022"
tags: [code-review, security, database, registration]
dependencies: []
---

# Missing search_path on SECURITY DEFINER Functions

## Problem Statement

The two new registration RPC functions (`bracket_blaze_registration_lookup` and `bracket_blaze_register_for_tournament`) are declared as `SECURITY DEFINER` but do not set `search_path`. This is a known Postgres security anti-pattern — a malicious user could create a schema with a poisoned function name that gets resolved before `public`, hijacking the execution context of the DEFINER function. Supabase's own security advisors flag this.

## Findings

- Both functions in the registration RPCs migration use `SECURITY DEFINER` without `SET search_path = public`
- The updated `bracket_blaze_find_or_create_player` function also lacks `search_path`
- Existing scoring RPCs (`bracket_blaze_submit_score`, `bracket_blaze_get_match_for_scoring`) also have this issue (systemic)
- Supabase security advisor will flag this as a vulnerability
- This is a well-documented attack vector: https://supabase.com/docs/guides/database/hardening

## Proposed Solutions

### Option A: Add search_path to all SECURITY DEFINER functions (Recommended)

Create a migration that alters all SECURITY DEFINER functions to include `SET search_path = public`:

```sql
ALTER FUNCTION bracket_blaze_registration_lookup SET search_path = public;
ALTER FUNCTION bracket_blaze_register_for_tournament SET search_path = public;
ALTER FUNCTION bracket_blaze_find_or_create_player SET search_path = public;
-- Also fix existing scoring RPCs:
ALTER FUNCTION bracket_blaze_submit_score SET search_path = public;
ALTER FUNCTION bracket_blaze_get_match_for_scoring SET search_path = public;
```

- **Pros:** Fixes vulnerability for all functions, simple ALTER statements, no behavior change
- **Cons:** Touches scoring functions (out of PR scope but should be fixed)
- **Effort:** Small (15 min)
- **Risk:** Very low — only restricts resolution path

## Acceptance Criteria

- [ ] All SECURITY DEFINER functions have `SET search_path = public`
- [ ] Supabase security advisor returns clean for this check
- [ ] Registration and scoring RPCs still function correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Systemic issue affecting scoring RPCs too |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- Supabase hardening guide: https://supabase.com/docs/guides/database/hardening
