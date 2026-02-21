---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, security, quality]
dependencies: []
---

# No Server-Side Score Validation

## Problem Statement

`completeMatch` in `matches.ts` accepts game scores from the client without validation. Negative scores, tied games, or empty arrays could be persisted. The winner determination logic exists only in the UI (`match-result-dialog.tsx`), not validated server-side.

## Findings

- `lib/actions/matches.ts:completeMatch()`:
  - `games: GameScore[]` parameter not validated (could be empty, have negative values, or tied scores)
  - Winner is passed from client - server doesn't verify it matches the scores
  - No check that at least one game was played
- `components/control-center/match-result-dialog.tsx`:
  - `determineWinner()` allows submission when all games are tied (returns null, button disabled, but server doesn't enforce)
  - Game scores default to 0-0 and user could submit without changing them

## Proposed Solutions

### Option A: Add Zod validation schema for match results (Recommended)
- Create a `matchResultSchema` that validates: scores non-negative, no tied games, winner matches score count, at least 1 game
- Validate in `completeMatch` before DB write
- Server-side winner verification: recompute winner from games array and compare
- **Pros**: Single source of truth for validation, catches all edge cases
- **Cons**: Minor effort
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Server validates game scores are non-negative integers
- [ ] Server validates no game has tied scores
- [ ] Server validates at least 1 game in the array
- [ ] Server independently verifies winner matches the game scores
- [ ] Invalid submissions return descriptive error messages

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | No server-side score validation |
