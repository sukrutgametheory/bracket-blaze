# Global Player Registry

**Date**: 2026-02-26
**Status**: Ready for planning

## What We're Building

A global player registry that gives every player a persistent identity across tournaments, uniquely keyed by phone number. Today, participants are tournament-scoped — the same person playing in three tournaments exists as three unrelated records. The global registry creates a single source of truth for "who is this player" while preserving the tournament-scoped participant layer for event-specific data.

### Core Behavior

1. **New `bracket_blaze_players` table** — global scope, phone number as unique key
2. **`bracket_blaze_participants` gains a `player_id` FK** — linking tournament participants to their global identity
3. **Phone number becomes required** for all participants (currently optional)
4. **Auto-linking on creation** — when a TD enters a phone number, the system finds-or-creates the global player and links automatically. No ambiguity, no confirmation step.
5. **Pre-fill from registry** — name, club, email auto-populate from the global record when a known phone is entered
6. **Shared across all TDs** — any TD can search and use any player from the global registry

### Data Model (Conceptual)

```
bracket_blaze_players (NEW - global)
├── id (UUID, PK)
├── phone (TEXT, UNIQUE, NOT NULL) — canonical identity
├── display_name (TEXT, NOT NULL)
├── email (TEXT, nullable)
├── club (TEXT, nullable)
├── created_at, updated_at

bracket_blaze_participants (MODIFIED - tournament-scoped)
├── ... existing columns ...
├── player_id (UUID, FK → players, NOT NULL) — NEW
├── phone (TEXT, NOT NULL) — changed from optional to required
```

### Flow: TD Adds a Participant

1. TD enters phone number
2. System searches `bracket_blaze_players` by phone
3. **If found**: Pre-fills name/club/email from global record. TD can override display name for this tournament.
4. **If not found**: TD fills in name/club/email. System creates global player record, then creates tournament participant linked to it.
5. Participant record created with `player_id` FK

## Why This Approach

**Approach A (new players table + FK) chosen over alternatives:**

- **vs. Promoting participants to global (Approach B)**: Would require rewriting every participant query and breaking the tournament-scoped unique constraint. High risk, high effort for same outcome.
- **vs. Using auth.users as identity (Approach C)**: Creating auth accounts for people who haven't signed up is awkward and couples "known to the system" with "can log in." Better to add auth linkage later when players self-register.

**Approach A wins because:**
- Minimal disruption — entries, matches, conflicts, and all existing queries continue working through participants unchanged
- Clean separation — global identity vs. tournament-specific data
- Future-ready — when players self-register, the `players` table gains a `user_id` FK to `auth.users`, and the existing participant flow adapts naturally

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Who creates player records | TDs only (for now) | Players don't interact with the system directly yet |
| Canonical identity | Phone number (unique) | Universal, doesn't require email or account creation |
| Phone requirement | Required for all participants | Guarantees every player is in the global registry |
| Matching behavior | Auto-link, no override | Phone = identity, no ambiguity. If phone matches, it's the same person. |
| Tournament-scoped layer | Keep participants table | Preserves tournament-specific overrides (display name, club for that event) |
| Global registry visibility | Shared across all TDs | Any TD can search/link to any player |
| Ratings/auto-seeding | Deferred to future | MVP is just the registry and cross-tournament identity |
| Existing data | Backfill required | Participants without phone numbers get flagged for TD to update |

## What This Enables (Future)

- **Player self-registration**: Players create accounts, link to their global record, register for tournaments directly
- **Ratings and auto-seeding**: Calculate ratings from match history, suggest seeds
- **Player profiles**: Tournament history, win/loss record, division participation
- **DUPR integration**: Link global player to DUPR ID for external ratings
- **Cross-tournament analytics**: Which players are most active, performance trends

## Open Questions

_None — all key decisions resolved during brainstorming._

## Out of Scope

- Player self-registration / auth accounts for players
- Ratings calculation or auto-seeding
- Player-facing profile pages
- DUPR or external rating system integration
- Phone number verification (SMS OTP)
- Bulk import of players to the global registry
