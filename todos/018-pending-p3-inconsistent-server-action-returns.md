---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, quality]
dependencies: []
---

# Inconsistent Server Action Return Types

## Problem Statement

Server actions in this PR use three different return type patterns, making it harder for callers (both UI and potential agent tools) to reliably handle responses.

## Findings

- `createParticipant` returns `{ data: participant }` or `{ error: string }`
- `updateParticipant` returns `{ data: updatedParticipant }` or `{ error: string }`
- `deleteParticipant` returns `{ success: true }` or `{ error: string }`
- `linkParticipantToPlayer` returns `{ success: true }` or `{ error: string }`
- `findPlayerByPhone` returns `{ data: Player | null; error?: string }` (error is optional, not separate branch)
- `findOrCreatePlayer` returns `{ data: string | null; error?: string }`
- `getUnlinkedParticipants` returns `Participant[]` directly (no error handling at all)

## Proposed Solutions

### Option A: Standardize on { data, error } pattern
- All actions return `{ data: T | null; error?: string }`
- Callers check `if (result.error)` consistently
- **Effort**: Small-Medium (touch all action return sites)
- **Risk**: Low

## Acceptance Criteria
- [ ] All server actions in participants.ts and players.ts use consistent return shape
- [ ] Callers updated to handle the consistent shape
