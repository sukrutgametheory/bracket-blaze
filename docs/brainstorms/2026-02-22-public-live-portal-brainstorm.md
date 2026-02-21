---
topic: Public Live Portal — Standings & Matches
date: 2026-02-22
status: complete
---

# Public Live Portal — Standings & Matches

## What We're Building

A public (no-auth) page at `/live/[tournamentId]` where players and spectators can view:

1. **Standings tab** — Swiss leaderboard per division with qualifier highlights, plus knockout bracket when applicable
2. **Matches tab** — Card-based view of live and completed matches with real-time score updates

This is the player-facing counterpart to the TD Control Center. Players check this on their phones between matches.

## Why This Approach

- **Single page with tabs** — One URL to share. Players bookmark it, TD posts it on a whiteboard. No navigation complexity.
- **`/live/[tournamentId]`** — Clean, descriptive URL. "Live" conveys real-time nature. Already excluded from auth via middleware pattern (`tv/` and `score/` set the precedent).
- **Real-time via Broadcast** — Same dual-channel pattern as Court TV. Broadcast for instant score ticks, postgres_changes for status transitions (new results, assignments).
- **Live + completed only** — Scheduled matches are TD territory. Players care about what's happening now and what already happened.

## Key Decisions

1. **URL**: `/live/[tournamentId]` — add `live/` to middleware matcher exclusions
2. **Layout**: Single page, two tabs (Standings / Matches)
3. **Standings tab**: Reuse the same standings engine + display logic from control center (Swiss table + knockout bracket tabs when applicable)
4. **Matches tab**: Card-based layout (not table). Each card shows:
   - Player/team names with scores
   - Division name + round label (Round N or Quarter-Final/Semi-Final/Final)
   - Court name + time played
   - Game-by-game score breakdown
   - Live matches: pulsing "LIVE" indicator + real-time score updates via Broadcast
5. **Match ordering**: Live matches pinned to top, then completed matches sorted newest-first
6. **Realtime**: Broadcast subscription for live score ticks, postgres_changes for status transitions (triggers data refresh)
7. **No auth required**: Public page, anon Supabase key, same pattern as Court TV
8. **Division filter**: Dropdown to filter by division (default: all)

## Resolved Questions

- **URL pattern?** → `/live/[tournamentId]`
- **Page structure?** → Single page with tabs
- **Match card content?** → Names, scores, division, round, court, time, game-by-game, live animation
- **Match scope?** → Live + completed only
- **Realtime?** → Yes, Broadcast + postgres_changes (same as Court TV)
