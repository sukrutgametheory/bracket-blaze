---
status: pending
priority: p3
issue_id: "030"
tags: [code-review, agent-native, registration]
dependencies: []
---

# No API Route for Toggle Registration (Agent-Native Gap)

## Problem Statement

The `toggleRegistration` function is a Next.js server action only accessible via the browser UI. There is no REST API endpoint for agents or external integrations to programmatically open/close registration for a tournament. Similarly, there's no way to list tournaments that are currently accepting registrations.

## Findings

- `lib/actions/tournaments.ts:49` — `toggleRegistration` is a server action (no API route)
- Agent-Native Reviewer flagged this as a parity gap
- All registration RPCs (lookup, register) are accessible via Supabase anon API
- But the TD-facing registration toggle requires browser UI
- No endpoint to list tournaments with `registration_open = true`

## Proposed Solutions

### Option A: Add API route when needed (Deferred)

Create `/api/tournaments/[id]/registration` endpoint when agent/integration use case arises. Not needed for MVP.

- **Pros:** No unnecessary work now
- **Cons:** Gap exists until implemented
- **Effort:** Deferred
- **Risk:** None for MVP

## Acceptance Criteria

- [ ] Tracked for future consideration
- [ ] Implement when agent/integration use case arises

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Agent-native gap — acceptable for MVP |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `lib/actions/tournaments.ts:49`
