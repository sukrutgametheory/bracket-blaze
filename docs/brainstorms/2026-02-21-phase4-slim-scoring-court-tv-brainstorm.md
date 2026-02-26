---
title: Phase 4 — Slim Scoring + Court TV + TD Sign-Off
type: feat
status: active
date: 2026-02-21
---

# Phase 4 — Slim Scoring + Court TV + TD Sign-Off

## What We're Building

A live scoring loop: referee scores point-by-point on their phone, Court TV shows scores in real-time to spectators, and the TD signs off on results before they count.

**Deliberately excluded from this phase:**
- Sport-specific scoring rules (badminton to 21, squash to 11, etc.)
- PWA / offline tolerance / service worker
- Individual referee accounts
- Single-court TV view (building multi-court overview instead)
- Auto game-end detection (referee manages game transitions manually)

## Why This Approach

Getting the live data loop working (referee → realtime → Court TV + Control Center) is the hardest infrastructure. Once that pipe exists, layering sport-specific engines on top is incremental. Starting with slim scoring avoids building 4 sport engines before validating the real-time flow works.

## Key Decisions

### 1. Referee Access Model
- TD generates **one tournament-level scoring token** (URL like `/score/{token}`)
- Each court has a **printed QR code** that resolves to `/score/{token}?court={courtId}`
- No referee login required — anyone with the token URL can score
- When scanned, the page loads whatever match is currently assigned to that court
- If no match is assigned, show "No match on this court"

### 2. Scoring UI (Slim)
- **+1 A** / **+1 B** — large touch targets for phone use
- **Undo** — reverts last point
- **End Game** — referee manually triggers game transition
- **Submit Match** — sends match to TD for sign-off
- No sport-specific validation (no "win by 2", no "cap at 30")
- Referee sees: **actual player/team names** (e.g. "Arjun Kapoor vs Priya Sharma"), division name, round info, current game score, game count, server indicator (future)

### 3. TD Sign-Off Workflow
- New match status: `pending_signoff` (between `on_court` and `completed`)
- Referee clicks "Submit Match" → status becomes `pending_signoff`
- TD sees pending matches in Control Center with an Approve / Reject action
- **Approve**: match → `completed`, standings update, bracket advances
- **Reject**: match → back to `on_court`, referee continues scoring (with TD note on what's wrong)
- Sign-off badge/counter visible in Control Center header

### 4. Court TV — Multi-Court Overview
- Single page showing **all courts** in a grid/list (airport departures board style)
- Each court card shows: court name, player names, current score, game indicator, match status
- Public URL: `/tv/{tournamentId}` — no auth required
- High contrast, large fonts for wall-mounted displays
- Auto-refreshes via Supabase Realtime — no manual refresh needed
- Status indicators: Empty, Scheduled, In Play (with live score), Pending Sign-Off, Completed

### 5. Realtime Infrastructure
- **Supabase Realtime** subscriptions on `bracket_blaze_matches` table
- Every point update writes to `bracket_blaze_match_events` AND updates `matches.meta_json` with current score
- Court TV subscribes to match changes for all courts in the tournament
- Control Center subscribes to match changes for live status updates
- Referee page subscribes to its own match (for multi-device sync and TD reject notifications)

### 6. Match Events (Audit Log)
- Every referee action writes to `bracket_blaze_match_events`:
  - `point` — `{ side: 'A'|'B', score_a: N, score_b: N, game: N }`
  - `undo` — `{ reverted_event_id: UUID }`
  - `game_end` — `{ game: N, final_score_a: N, final_score_b: N }`
  - `submit` — `{ games: GameScore[] }`
- Actor is anonymous (token-based, no user_id) — store token identifier instead
- Events are immutable — undo creates a new event, doesn't delete

### 7. Data Model Changes
- `bracket_blaze_tournaments` — add `scoring_token` (UUID, nullable) for referee access
- `bracket_blaze_matches.status` — add `pending_signoff` to the status enum
- `bracket_blaze_matches.meta_json` — extend with `live_score` field for point-by-point state:
  ```json
  {
    "games": [...],
    "live_score": { "score_a": 5, "score_b": 3, "current_game": 2 }
  }
  ```

## Component Breakdown

### Referee Scoring Page
- Route: `/score/[token]/page.tsx`
- URL param: `?court={courtId}`
- Server component validates token, resolves tournament + court + current match
- Client component with scoring buttons, live state, realtime subscription
- Header shows: match info (division, round, match #), **full player/team names** for both sides
- Large touch targets, minimal UI, phone-optimized

### Court TV Page
- Route: `/tv/[tournamentId]/page.tsx`
- Public (no auth)
- Server component loads all courts + assigned matches
- Client component with realtime subscription grid
- Auto-scales layout based on court count (2-col for 4 courts, 3-col for 6-7)

### Control Center Updates
- Add "Pending Sign-Off" section or badge in Courts tab
- Approve/Reject buttons on matches in `pending_signoff` state
- Live score display on court cards (updates via realtime)

### Token Management
- TD generates scoring token from tournament settings or Control Center
- Simple "Generate Scoring Link" button → copies URL to clipboard
- "Generate Court QR Codes" → renders printable QR sheet for all courts

## Open Questions

_None — all major decisions resolved during brainstorm._

## Success Criteria

- Referee can score a match point-by-point from their phone
- Court TV updates within 1 second of each point
- TD can approve/reject submitted matches before they count
- System handles 7 simultaneous courts with live scoring without lag
