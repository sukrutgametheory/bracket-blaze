---
topic: Doubles Division & Team Management
date: 2026-02-22
status: complete
---

# Doubles Division & Team Management

## What We're Building

Add doubles support to divisions: a TD can create a doubles division, pair two participants into a team, assign team entries, and see "Player A / Player B" display names everywhere singles names currently appear.

The database schema already supports this (teams, team_members, entries with XOR constraint). The work is primarily UI and display name resolution across ~14 components.

## Why This Approach

- **New `play_mode` column on divisions** — Clean, queryable, drives the entry management UI to show singles vs doubles flow. Requires a migration but is the right long-term choice.
- **Pick-two-from-pool for team creation** — Mirrors the existing singles flow (pick one participant). TD selects two participants, system auto-creates team + team_members + entry. No separate team management step.
- **Auto-generated display names ("Player A / Player B")** — No custom team names needed. Simplest approach. The `teams.name` column stores the auto-generated name for display.
- **Centralized display name resolver** — One utility function `getEntryDisplayName(entry)` replaces 14+ hardcoded `participant.display_name` references. Checks if entry has participant (singles) or team (doubles), returns the right string.

## Key Decisions

1. **Division field**: New `play_mode` column (`singles` | `doubles`) on `bracket_blaze_divisions` table. Default: `singles`. Added to division creation form as a toggle/select.
2. **Team creation flow**: In entry management for a doubles division, TD picks two participants from the pool. System creates team (name = "Player A / Player B"), team_members, and entry with `team_id`.
3. **Display names**: Auto-generated "Player A / Player B" from team members. Stored in `teams.name` at creation time. No custom name override.
4. **Display name resolution**: Centralized helper function used across all components. All Supabase queries updated to join team data alongside participant data.
5. **Cross-division play**: A player can be in both singles and doubles divisions. The existing conflict engine handles scheduling overlaps (but needs updating to resolve team_members → participant_ids for doubles entries).
6. **Draw size**: For doubles, draw_size still represents number of entries (teams), not individual players. A draw_size of 8 means 8 teams = 16 players.

## Resolved Questions

- **Display name format?** → "Player A / Player B" auto-generated
- **Team creation UX?** → Pick two from existing participant pool (same dialog, pick two instead of one)
- **Where to store play_mode?** → Proper column on divisions table (not rules_json)
- **Cross-division?** → Yes, same player can be in singles + doubles divisions
- **Custom team names?** → No, auto-generated only for MVP
