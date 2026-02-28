---
status: pending
priority: p2
issue_id: "027"
tags: [code-review, security, registration, infrastructure]
dependencies: []
---

# No Rate Limiting or Bot Protection on Anonymous Registration RPCs

## Problem Statement

The registration RPCs (`bracket_blaze_registration_lookup` and `bracket_blaze_register_for_tournament`) are callable by anyone with the anon key. There is no rate limiting, CAPTCHA, or bot protection. An attacker could:

1. Enumerate phone numbers via the lookup RPC to discover registered players
2. Spam registrations to fill up divisions
3. Overwrite player data by bulk-submitting with known phone numbers

This is a common vulnerability for public-facing forms.

## Findings

- Both RPCs are granted to `anon` role — no authentication required
- Supabase's built-in rate limiting is per-project, not per-endpoint
- The lookup RPC returns player names and emails for known phone numbers (enumeration risk)
- No honeypot field, CAPTCHA, or rate limiting on the client side
- The lookup RPC currently returns full player data — could be scoped down

## Proposed Solutions

### Option A: Add Cloudflare Turnstile (Recommended for production)

Add Cloudflare Turnstile (free CAPTCHA alternative) to the registration form. Verify the token in a Supabase Edge Function wrapper before calling the RPC.

- **Pros:** Blocks bots, free, invisible to real users
- **Cons:** Requires Cloudflare account setup, Edge Function wrapper
- **Effort:** Medium (1-2 hours)
- **Risk:** Low

### Option B: Reduce lookup RPC exposure (Quick win)

Modify the lookup RPC to not return player email when phone is found — only return display_name (which the player typed themselves). This reduces the PII enumeration surface.

- **Pros:** Quick fix, reduces exposure
- **Cons:** Doesn't prevent registration spam
- **Effort:** Small (15 min)
- **Risk:** Low

### Option C: Add honeypot field (Quick client-side protection)

Add a hidden form field that bots fill but humans don't. Check on submit.

- **Pros:** Very quick to implement, no external dependencies
- **Cons:** Sophisticated bots bypass honeypots
- **Effort:** Small (15 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Automated bot submissions are blocked or significantly reduced
- [ ] Phone enumeration is mitigated
- [ ] Real users can still register without friction

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Consider Option B as quick win, Option A for production |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
