---
title: "fix: Restore Responsive Multi-Column Layout In Live Portal Matches"
type: fix
status: active
date: 2026-03-07
origin: docs/brainstorms/2026-02-22-public-live-portal-brainstorm.md
---

# fix: Restore Responsive Multi-Column Layout In Live Portal Matches

## Overview

The public live portal at `/live/[tournamentId]` currently renders the Matches tab as a single vertical stack even on desktop screens. The live production report references [https://bracket-blaze.vercel.app/live/9921d16d-fb68-4778-ae70-60c90f30d375](https://bracket-blaze.vercel.app/live/9921d16d-fb68-4778-ae70-60c90f30d375), where desktop users see one narrow column of cards instead of a responsive multi-column layout.

This fix should preserve the live portal's original product decisions from the brainstorm and shipped plan: a single public page, card-based matches view, live/completed ordering, and realtime score updates (see brainstorm: `docs/brainstorms/2026-02-22-public-live-portal-brainstorm.md`). The change is limited to layout behavior in the Matches tab.

## Problem Statement / Motivation

The live portal is meant to be phone-friendly, but it also needs to scale up cleanly on desktop and wall-mounted displays. Right now the Matches tab wrapper is hard-coded to a single-column stack:

- `components/live-portal/live-portal-client.tsx:184` uses `space-y-3 max-w-2xl`
- That combination constrains the list to a narrow column and prevents Tailwind breakpoint-driven column expansion

This creates three user-facing problems:

- Desktop users waste horizontal space and need to scroll more than necessary
- Spectators monitoring many concurrent matches cannot scan the board efficiently
- The behavior is inconsistent with existing responsive grid patterns already used elsewhere in the repo, such as [components/court-tv/court-tv-client.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/court-tv/court-tv-client.tsx#L118) and [components/tournaments/tournament-list.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/tournaments/tournament-list.tsx#L36)

## Proposed Solution

Replace the single-column Matches tab wrapper in [components/live-portal/live-portal-client.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/live-portal/live-portal-client.tsx#L178) with an explicit responsive grid that:

- stays single-column on mobile
- becomes two columns at tablet / small desktop widths
- expands to three columns on larger desktop widths when enough cards exist
- preserves current match ordering, card content, realtime updates, and division filtering

The implementation should follow established project patterns instead of inventing a new layout system:

- reuse the breakpoint style already seen in Court TV and other list surfaces
- keep `MatchCard` as the leaf presentation component
- keep the server data shape and Supabase subscriptions unchanged

## Technical Considerations

- This is a presentation-layer fix. No schema, query, or realtime contract changes should be required.
- Use CSS grid, not CSS columns, so DOM order stays aligned with the current "live first, then completed newest-first" sort.
- Avoid hard width caps like `max-w-2xl` on the card list container unless they are paired with centered desktop rails intentionally.
- Validate card behavior with long division names, long player/team names, and mixed live/completed cards so the grid does not produce unreadable overflow.

## System-Wide Impact

- **Interaction graph**: [app/live/[tournamentId]/page.tsx](/Users/sukrutgejji/marketing/bracket-blaze/app/live/[tournamentId]/page.tsx) fetches tournament/match data, passes it into `LivePortalClient`, and `LivePortalClient` renders `MatchCard` instances. This fix changes only the wrapper around those cards.
- **Error propagation**: No new backend or mutation failure paths are introduced. The main risk is a visual regression if breakpoint classes are wrong or if the grid collapses around empty states.
- **State lifecycle risks**: Realtime `setMatches` updates must continue to patch card content in place. The fix should not introduce key churn, remount loops, or subscription changes.
- **API surface parity**: The affected surface is the public live portal Matches tab only. Court TV and control center remain reference implementations for responsive layout patterns, not shared code paths.
- **Integration test scenarios**:
  - Desktop viewport with 6+ matches renders multiple columns while preserving live-first ordering.
  - Mobile viewport remains a single-column list with unchanged card spacing.
  - Division filter reduces the grid to the filtered subset without leaving broken gaps or stale cards.
  - Broadcast-driven live score updates still update the correct card while cards are arranged in a grid.
  - Empty state still spans cleanly when no matches are present.

## Acceptance Criteria

- [x] The Matches tab on `/live/[tournamentId]` renders as a single column on mobile widths.
- [x] The Matches tab renders at least two columns on medium desktop/tablet widths when two or more matches exist.
- [x] The Matches tab renders up to three columns on large desktop widths when enough matches exist.
- [x] The current match ordering remains unchanged: live matches first, completed matches newest-first.
- [x] Division filtering still applies correctly to the displayed cards after the layout change.
- [x] Live score updates via Supabase Broadcast continue to update the correct card without full-page layout breakage.
- [x] The empty state remains centered and readable when there are no matches.
- [x] Standings tab behavior is unchanged.
- [ ] Manual verification covers the reported production URL and a local/dev environment at mobile and desktop breakpoints.

## Success Metrics

- Desktop users can scan multiple matches without unnecessary vertical scrolling.
- The reported production regression is no longer reproducible on a width of at least 1280px.
- No new visual regressions are introduced on mobile widths.

## Dependencies & Risks

- **Dependency**: The fix depends on the current `MatchCard` component remaining self-contained and width-agnostic.
- **Risk**: Uneven card heights may make the grid feel visually noisy.
  Mitigation: prefer a simple grid with `items-start` and keep internal card spacing unchanged.
- **Risk**: Using the wrong breakpoint mix could make tablets worse while fixing desktop.
  Mitigation: verify at representative widths such as 390px, 768px, 1024px, and 1280px.
- **Risk**: A layout-only change could be under-tested because there are no backend failures.
  Mitigation: require viewport-based manual verification and, if the repo already supports it, add a browser-level regression check for the live portal.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-02-22-public-live-portal-brainstorm.md](/Users/sukrutgejji/marketing/bracket-blaze/docs/brainstorms/2026-02-22-public-live-portal-brainstorm.md)  
  Carried-forward decisions: keep `/live/[tournamentId]` as a single public page, keep the Matches tab card-based, and preserve realtime live score behavior.
- Existing live portal implementation: [components/live-portal/live-portal-client.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/live-portal/live-portal-client.tsx#L178)
- Server page for the portal: [app/live/[tournamentId]/page.tsx](/Users/sukrutgejji/marketing/bracket-blaze/app/live/[tournamentId]/page.tsx)
- Responsive grid reference: [components/court-tv/court-tv-client.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/court-tv/court-tv-client.tsx#L118)
- Responsive grid reference: [components/tournaments/tournament-list.tsx](/Users/sukrutgejji/marketing/bracket-blaze/components/tournaments/tournament-list.tsx#L36)
- Original shipped plan for the live portal: [docs/plans/2026-02-22-feat-public-live-portal-plan.md](/Users/sukrutgejji/marketing/bracket-blaze/docs/plans/2026-02-22-feat-public-live-portal-plan.md#L135)

## SpecFlow Analysis

### User Flow Overview

1. A spectator opens the live portal on desktop, lands on the Matches tab, and expects to scan several concurrent matches at once.
2. A player opens the same page on mobile and expects a simple single-column card list.
3. A user applies a division filter and expects the card layout to reflow without changing sort order or losing live updates.
4. A live score update arrives through Broadcast and should update card content without disturbing layout or tab state.

### Missing Elements & Gaps

- **Category**: Breakpoints
  **Gap Description**: The current implementation does not define what desktop behavior should be beyond "mobile-friendly."
  **Impact**: The component shipped with a layout that never expands past one column.
- **Category**: Visual regression coverage
  **Gap Description**: The original live portal plan does not call out viewport-specific checks for the Matches tab.
  **Impact**: Desktop regressions can ship unnoticed while mobile still looks correct.
- **Category**: Empty and sparse states
  **Gap Description**: The layout spec should define behavior for 0, 1, and 2 cards so the grid does not look broken at intermediate counts.
  **Impact**: A fix for 6 cards could still produce awkward alignment for smaller lists.

### Recommended Next Steps

1. Replace the Matches wrapper with a responsive grid in `components/live-portal/live-portal-client.tsx`.
2. Keep `MatchCard` content unchanged unless grid testing exposes truncation or overflow problems.
3. Verify the production URL and local/dev builds at representative breakpoints before closing the bug.
