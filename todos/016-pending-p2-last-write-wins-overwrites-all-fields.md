---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, data-integrity]
dependencies: []
---

# Last-Write-Wins Overwrites All Global Player Fields on Any Edit

## Problem Statement

When a TD edits any field on a participant (e.g., just the email), the `updateParticipant` action pushes ALL non-phone fields (display_name, club, email) to the global player record. This means editing one field silently overwrites the others on the global record, even if they weren't changed. A TD in Tournament B editing a participant's email will overwrite the display_name and club that TD-A set in Tournament A.

## Findings

- `lib/actions/participants.ts` lines 107-116: Global player update always sends all three fields
- `supabase/migrations/20250106000002_add_player_id_to_participants.sql` lines 33-36: `find_or_create_player` also overwrites all fields on conflict
- No comparison between old and new values before writing
- The `updateParticipant` action fetches the participant (line 79-83) but doesn't fetch the current global player state

## Proposed Solutions

### Option A: Only propagate changed fields (Recommended)
- Fetch current global player state before updating
- Compare each field and only update fields that actually changed
- **Pros**: Prevents accidental overwrites across tournaments
- **Cons**: Extra SELECT query, slightly more complex logic
- **Effort**: Medium
- **Risk**: Low

### Option B: Accept as known limitation for MVP
- Document the behavior clearly
- Revisit when multi-TD collaboration or player self-service features arrive
- **Pros**: No code change needed
- **Cons**: Data integrity risk grows with scale
- **Effort**: None
- **Risk**: Medium at scale

## Acceptance Criteria
- [ ] Editing a single field on a participant does not overwrite unrelated fields on the global player record
- [ ] OR the behavior is documented and accepted as MVP trade-off
