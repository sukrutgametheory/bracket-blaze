---
topic: Player Self-Registration
date: 2026-02-28
status: complete
---

# Player Self-Registration

## What We're Building

A public-facing registration form at `/register/[tournamentId]` where players can sign up for a tournament and select divisions — without needing an account. The form uses the phone-first pattern from the global player registry: enter phone, auto-fill if known, collect remaining details, pick divisions, submit.

**Core flow:**
1. TD creates tournament, divisions, and opens registration (toggle)
2. TD shares the registration URL
3. Player visits URL, enters phone number
4. If existing player: name/email/DUPR pre-filled. If new: collects name, email, phone
5. Player sees available divisions with spots remaining, selects one or more
6. For doubles divisions: per-division partner fields appear (partner name, phone)
7. Submit creates participant + entries (and teams for doubles) atomically
8. Player sees confirmation with their registrations

## Why This Approach

**SECURITY DEFINER RPC** — A single Postgres function handles all writes (find/create player, create participant, create entries, create teams for doubles). This matches the established pattern used by the scoring system (`bracket_blaze_submit_score`, `bracket_blaze_undo_score`) where unauthenticated writes go through `SECURITY DEFINER` functions granted to the `anon` role. Benefits:

- Atomic: all-or-nothing registration (no partial state)
- Secure: RLS stays tight, only the RPC function has elevated privileges
- Race-safe: capacity checks use row-level locking in Postgres
- Consistent: follows existing codebase patterns

**Alternatives considered:**
- Server Action + Service Role: easier TypeScript but not atomic, diverges from patterns
- Hybrid (reads via anon, writes via RPC): clean but unnecessary complexity since reads are already RLS-permitted for public data

## Key Decisions

1. **Auto-accept**: Players are immediately registered if spots remain. TD can remove later. No approval queue.

2. **Multi-division select**: Single form submission, player checks multiple divisions. One submit creates all entries.

3. **Doubles: one registers both**: When a doubles division is selected, partner fields appear for that division (partner name, phone). Different partners per division allowed.

4. **Open/close toggle**: TD explicitly opens and closes registration. The URL only works when registration is open.

5. **DUPR ID on global player**: Stored on `bracket_blaze_players` so it carries across tournaments. Pre-filled for returning pickleball players. Only shown/required when at least one selected division is pickleball.

6. **Standalone URL**: The form lives at `/register/[tournamentId]` as a standalone public page. No embedding needed.

7. **Phone as identity**: Same phone-first pattern as existing participant dialog. Phone number is the lookup key into the global player registry.

8. **Capacity = draw_size**: Spots remaining = `draw_size - current_entry_count` per division.

## Resolved Questions

- **Approval flow?** Auto-accept. No TD approval needed.
- **Doubles handling?** One player registers both. Per-division partner fields.
- **Registration control?** Open/close toggle on tournament.
- **Multi-division?** Yes, multi-select in single form.
- **DUPR storage?** Global player record.
- **Embedding?** Not needed — standalone URL.
- **Confirmation?** On-screen only. No SMS/email for MVP.
- **Re-visit behavior?** After phone lookup, show existing registrations and allow adding more divisions.
- **Partner validation?** Yes — partner phone triggers the same find-or-create flow. Partner becomes a full participant with player_id linked to the global registry.
