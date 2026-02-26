---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

# No Authentication/Authorization in Phase 3 Server Actions

## Problem Statement

All Phase 3 server actions (`matches.ts`, `draws.ts`, `court-assignments.ts`) execute mutations without verifying the caller is authenticated or authorized for the tournament. Any unauthenticated request hitting these endpoints can start matches, record results, generate rounds, or assign courts.

## Findings

- `lib/actions/matches.ts` - `startMatch`, `completeMatch`, `recordWalkover` have no auth checks
- `lib/actions/draws.ts` - `generateNextSwissRound`, `generateKnockoutDraw` have no auth checks
- `lib/actions/court-assignments.ts` - `assignMatchToCourt` accepts a client-supplied `userId` parameter instead of reading from the session
- The control center page (`page.tsx`) checks auth at render time but server actions are independently callable

## Proposed Solutions

### Option A: Add auth check helper (Recommended)
- Create a shared `requireTournamentAuth(tournamentId)` helper that calls `supabase.auth.getUser()` and verifies TD role
- Add to the top of every server action
- **Pros**: Consistent, reusable, catches all paths
- **Cons**: Slightly more code per action
- **Effort**: Small
- **Risk**: Low

### Option B: Rely on RLS policies only
- Tighten RLS to enforce auth at the DB level
- **Pros**: Defense in depth
- **Cons**: RLS alone can't enforce business logic like "only the TD who owns this tournament"
- **Effort**: Medium
- **Risk**: Medium - RLS errors are harder to debug

## Acceptance Criteria

- [ ] Every server action verifies user authentication via `supabase.auth.getUser()`
- [ ] `assignMatchToCourt` reads userId from session, not from client parameter
- [ ] Unauthorized calls return clear error messages
- [ ] No server action can be called without a valid session

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | All Phase 3 server actions lack auth |
