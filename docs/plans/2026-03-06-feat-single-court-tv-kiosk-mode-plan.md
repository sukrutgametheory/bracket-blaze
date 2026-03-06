---
title: "feat: Single-Court TV Kiosk Mode"
type: feat
status: active
date: 2026-03-06
origin: docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md
---

# feat: Single-Court TV Kiosk Mode

## Overview

Add a dedicated per-court TV route at `/tv/[tournamentId]/court` that renders a single selected court in a full-screen, high-contrast layout for 42-inch displays, while keeping existing multi-court TV (`/tv/[tournamentId]`) unchanged.

This plan carries forward all finalized decisions from the brainstorm (see brainstorm: `docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md`).

## Problem Statement / Motivation

Current Court TV is optimized for multi-court overview cards, not a per-court wall display. On 42-inch TVs, names and scores need larger, persistent single-court focus. The flow also needs remote-friendly court switching with one shared URL for all TVs, plus deterministic handling for `ready`, `on_court`, `pending_signoff`, `completed`, and empty court states.

## Research Summary

### Repo Research (local)

- Existing public TV route and server data-loading pattern are in place and reusable:
  - `app/tv/[tournamentId]/page.tsx:10-70`
- Existing TV client already has realtime plumbing (Broadcast + postgres changes) and state handling for `ready`, `on_court`, `pending_signoff`, `completed`, and empty:
  - `components/court-tv/court-tv-client.tsx:42-105`
  - `components/court-tv/court-tv-client.tsx:179-343`
- Existing referee court-picker pattern already implements single-URL + court selection and is a direct UI/flow reference:
  - `app/score/[token]/page.tsx:46-114`
- TV routes are already public via middleware matcher exclusions and embed-friendly headers:
  - `middleware.ts:17`
  - `next.config.ts:7-18`
- Existing display-name helper supports both singles and doubles and should be reused:
  - `lib/utils/display-name.ts:5-12`

### Institutional Learnings (docs/solutions)

- Relevant documented learning is performance-oriented: avoid query loops and use eager loading / batched fetches.
  - `docs/solutions/2026-02-22-n1-query-performance-analysis.md`
  - `docs/solutions/QUERY-PATTERNS-REFERENCE.md`
- No dedicated TV/kiosk-specific learning docs were found.
- `docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

### External Research Decision

Skipped. This feature is UI + local realtime composition on established internal patterns (no new external API/security/payment risk), and existing project conventions are clear.

## SpecFlow Analysis

### User Flow Overview

1. TV opens `/tv/[tournamentId]/court`.
2. App reads persisted `selectedCourtId` from local storage.
3. If persisted court exists and is active, render that court immediately.
4. If not, show court selection overlay; user navigates with remote and selects court.
5. TV renders single-court board:
   - `ready`: names + division + `Starting Soon` (see brainstorm: `docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md`)
   - `on_court`: live point score
   - `pending_signoff`: submitted/waiting state with current/final score view
   - `completed`: final score persists until reassignment (see brainstorm)
   - no match: `Awaiting Assignment` only (see brainstorm)
6. Realtime updates adjust score/status continuously; court can be changed from UI at any time.

### Flow Permutations Matrix

| Context | Entry | Expected Result |
|---|---|---|
| First-time TV | No local storage | Court selector shown |
| Returning TV | Valid stored court | Directly opens stored court |
| Returning TV | Stored court removed/inactive | Fallback to selector |
| Match status `ready` | Selected court has assigned match | Names + division + Starting Soon |
| Match status `on_court` | Ref scoring in progress | Live score updates via Broadcast |
| Match status `pending_signoff` | Ref submitted | Pending state shown; score remains visible |
| Match status `completed` | Match finished | Final score remains until next assignment |
| No match | Court idle | Awaiting Assignment only |

### Gaps Identified and Resolutions in Plan

- **Court persistence invalidation**: define behavior when stored court is no longer active.
  - Resolution: clear invalid stored value and show selector.
- **Remote input model**: keyboard/remote navigation was unspecified.
  - Resolution: selector must support arrow/tab focus + Enter selection + visible focus state.
- **Status transition update strategy**: TV must run continuously without manual refresh or full-page reload.
  - Resolution: use in-memory reconciliation on `postgres_changes`, automatic reconnect, and silent selected-court refetch for self-healing.

## Proposed Solution

Build a new dedicated page and client component:

- New route: `app/tv/[tournamentId]/court/page.tsx`
- New client: `components/court-tv/single-court-tv-client.tsx`

Server component responsibilities:
- Validate active tournament (public read)
- Fetch active courts for selector
- Fetch assigned matches for active courts with current relation shape used by TV
- Pass initial data + Supabase env keys to client

Client responsibilities:
- Manage selected court state with `localStorage`
- Render selector overlay + switch-court action
- Render one full-screen scoreboard with large type
- Subscribe to live Broadcast channel for selected match (`match:{matchId}`)
- Subscribe to `bracket_blaze_matches` `postgres_changes` for assignment/status changes and reconcile selected-court view
- Preserve completed score display until replacement assignment arrives
- Run continuously with zero manual refresh requirement after initial URL load

## Technical Considerations

- **No schema changes required**: existing `MatchStatus` and `meta_json.live_score/games` model already supports this (`types/database.ts:11`, `types/database.ts:219-238`).
- **Public access remains required**: new route inherits existing `/tv/` middleware exemption (`middleware.ts:17`).
- **Realtime channel scope**:
  - Broadcast subscription only for selected active match
  - status updates via `postgres_changes` to detect reassignment/completion
  - no full-page navigation reloads for status changes
- **Performance**:
  - Keep eager loading on initial server query (no per-court loops)
  - Do not introduce N+1 query patterns (from learnings)
- **A11y / remote UX**:
  - explicit focus ring and keyboard navigation in selector
  - avoid interaction models that require touch-only input

## System-Wide Impact

- **Interaction graph**:
  - Ref taps score in `components/scoring/scoring-client.tsx:118-183` → Broadcast `match:{id}` event emitted (`components/scoring/scoring-client.tsx:98-103`) → new single-court TV client receives and updates score.
  - Match status/court assignment changes in backend → postgres changes stream → TV client updates selected-court state.
- **Error propagation**:
  - Supabase subscribe failures should auto-reconnect; after reconnect, perform silent selected-court data refetch to self-heal without page reload.
- **State lifecycle risks**:
  - Risk: stale stored court id after court deactivation/tournament edit.
  - Mitigation: validate selected court against active court list on mount and each sync reconciliation pass.
- **API surface parity**:
  - Existing `/tv/[tournamentId]` remains unchanged.
  - New route shares query shape and display-name resolution helper.
- **Integration test scenarios**:
  - selector persistence and invalidation
  - live score update with selected court
  - status transitions `ready -> on_court -> pending_signoff -> completed`
  - completed score persistence until new assignment
  - switch-court while previous court receives updates

## Implementation Plan

### Phase 1: Route + Data Foundation

- [x] Create `app/tv/[tournamentId]/court/page.tsx` server page using the same public fetch strategy as `app/tv/[tournamentId]/page.tsx`.
- [x] Query active courts and assigned matches with eager-loaded participant/team + division fields.
- [x] Return `notFound()` for inactive/missing tournament.

### Phase 2: Single-Court Kiosk UI

- [x] Create `components/court-tv/single-court-tv-client.tsx`.
- [x] Implement court selector overlay and `localStorage` persistence key (scoped by tournament id).
- [x] Implement top-level “Change Court” control for remote-driven switching.
- [x] Implement state views:
  - `ready`: names + division + `Starting Soon`
  - `on_court`: live scores
  - `pending_signoff`: submitted state + score
  - `completed`: final score persists
  - no match: `Awaiting Assignment` only
- [x] Apply 42-inch-optimized typography and spacing (single content column, oversized names and scores).

### Phase 3: Realtime + Robustness

- [x] Subscribe to Broadcast for selected match only (`match:{matchId}`).
- [x] Subscribe to `postgres_changes` for match updates and reconcile selected-court match entity in memory (no full-page reload).
- [x] Handle selected-court invalidation if court is removed/inactive.
- [x] Implement automatic reconnect and silent selected-court refetch on reconnect/visibility wake (no manual refresh action required).

### Phase 4: Verification

- [x] Manual test on desktop and 1920x1080 simulation.
- [x] Validate keyboard/remote navigation in selector.
- [ ] Verify all match states with seeded data and live scoring path.
- [x] Confirm `/tv/[tournamentId]` behavior unchanged.
  - Current active dataset has no court-assigned `ready/on_court/pending_signoff/completed` matches, so full live-state browser validation is pending data setup.

## Alternative Approaches Considered

1. Extend existing `components/court-tv/court-tv-client.tsx` with mode flags.
   - Rejected because it increases coupling and makes large-screen kiosk behavior harder to evolve safely.
2. Keep only multi-court grid with “focus mode”.
   - Rejected because it compromises readability and state clarity for dedicated per-court TVs.

(see brainstorm: `docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md`)

## Acceptance Criteria

### Functional Requirements

- [x] New public route exists: `/tv/[tournamentId]/court`.
- [x] First-time load shows court selector.
- [x] Returning load defaults to last selected active court.
- [x] User can change court from TV UI at any time.
- [ ] `ready` displays player/team names, division, and `Starting Soon`.
- [ ] `on_court` displays live score updates from referee actions.
- [ ] `pending_signoff` displays pending state without losing score context.
- [ ] `completed` keeps final score visible until a new match is assigned to that court.
- [x] Idle court displays only `Awaiting Assignment`.
- [x] Existing multi-court TV page remains unchanged.

### Non-Functional Requirements

- [x] Score and names are legible on 42-inch 1080p display at ~3m distance.
- [x] Selector is operable via keyboard/TV remote inputs.
- [ ] Realtime updates remain stable when switching courts.
- [x] TV continues updating without any manual browser refresh after initial URL load.
- [ ] No additional auth requirement is introduced for TV routes.

### Quality Gates

- [x] No N+1 query loops introduced in new server fetch logic.
- [x] TypeScript passes without introducing new `any` in new files.
- [ ] Existing TV and scoring flows smoke-tested after change.

## Success Metrics

- Court TVs show the correct selected court without operator reconfiguration after reconnect/resume.
- Score changes appear on selected-court TV within existing realtime expectations.
- On-site operators can switch courts within 2-3 remote actions.
- No regressions reported on existing `/tv/[tournamentId]` wallboard.

## Dependencies & Risks

### Dependencies

- Existing realtime pipeline from scoring client (`components/scoring/scoring-client.tsx:98-103`).
- Existing public TV route protections in middleware and headers.

### Risks

- **Stale persisted court ID** if court config changes during event.
  - Mitigation: validate against active courts each sync pass and force selector fallback.
- **Selector usability on heterogeneous TV remotes.**
  - Mitigation: rely on semantic focusable controls and explicit visible focus states.
- **Event desync after transient websocket disconnect.**
  - Mitigation: automatic reconnect + targeted selected-court refetch on reconnect; avoid full-page reload.

## Out of Scope

- Replacing existing multi-court `/tv/[tournamentId]` grid.
- Adding “Up Next” preview content for idle courts.
- Sport-specific scoring rules changes.
- QR generation and token flows (already handled in referee flow).

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md](/Users/sukrutgejji/marketing/bracket-blaze/docs/brainstorms/2026-03-06-single-court-tv-kiosk-brainstorm.md)  
  Carried-forward decisions: dedicated route, one URL + in-UI switching, persisted court selection, ready/idle/completed state behavior.
- Existing TV server pattern: `app/tv/[tournamentId]/page.tsx:10-70`
- Existing TV realtime/state pattern: `components/court-tv/court-tv-client.tsx:42-116`, `components/court-tv/court-tv-client.tsx:179-343`
- Existing selector pattern: `app/score/[token]/page.tsx:46-114`
- Route/public access config: `middleware.ts:17`, `next.config.ts:7-18`
- Display name utility: `lib/utils/display-name.ts:5-12`
- Institutional learnings:
  - `docs/solutions/2026-02-22-n1-query-performance-analysis.md`
  - `docs/solutions/QUERY-PATTERNS-REFERENCE.md`
