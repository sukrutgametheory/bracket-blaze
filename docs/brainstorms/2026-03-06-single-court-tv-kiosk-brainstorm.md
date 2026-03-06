---
title: Single-Court TV Kiosk Mode
type: feat
status: active
date: 2026-03-06
---

# Single-Court TV Kiosk Mode

## What We're Building

A dedicated single-court TV experience at a new route: `/tv/[tournamentId]/court`.

Each physical TV opens the same URL. On first load, the screen shows a court picker. After selection, the TV displays one full-screen court scoreboard with large typography optimized for a 42-inch display. The selected court is persisted locally in the browser so that subsequent reloads/default opens return to the same court automatically.

The scoreboard shows:
- Tournament name
- Division name
- Court name
- Player/team names
- Live score while referee is scoring
- State-specific messaging for `ready`, `on_court`, `pending_signoff`, `completed`, and no assigned match

## Why This Approach

We chose a separate route instead of extending the existing multi-court page so kiosk UX can be purpose-built for readability, remote navigation, and large-screen typography without coupling to grid behavior. This keeps the current `/tv/[tournamentId]` multi-court board stable while enabling a focused single-court experience with clear state handling.

## Key Decisions

- **Dedicated route:** Build `/tv/[tournamentId]/court` as a separate single-court page.
- **Single URL for all TVs:** All screens use the same URL, then select court in UI.
- **Court persistence:** Default to last selected court on that TV via local storage.
- **No-match state:** Show clean `Awaiting Assignment` only.
- **Ready state:** Show player names + division + `Starting Soon`.
- **Completed state:** Keep final score visible until TD assigns the next match.
- **Realtime behavior:** Continue using current live score pipeline so TV reflects referee updates.
- **Display priority:** Optimize for full-screen large names/scores first; keep auxiliary metadata secondary.

## Resolved Questions

- **Court binding model:** TV should allow court selection in UI (not hard-locked by URL).
- **Initial load behavior:** Use last selected court by default.
- **Completed match behavior:** Keep final score visible until next assignment.
- **Idle court behavior:** Show only `Awaiting Assignment`.
- **Ready match behavior:** Show names + division + `Starting Soon`.

## Open Questions

None at this stage.

## Next Steps

Proceed to `/prompts:workflows-plan` to define exact files, data queries, realtime subscription scope, and UI acceptance criteria for remote-friendly court switching and full-screen rendering.
