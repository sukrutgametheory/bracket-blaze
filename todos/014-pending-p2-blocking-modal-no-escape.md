---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, ux]
dependencies: []
---

# Backfill Modal Blocks Participants Page With No Escape

## Problem Statement

The backfill modal prevents dismissal via click-outside AND escape key. If a TD has unlinked participants but doesn't know their phone numbers right now, they are permanently locked out of the participants page. There is no skip, defer, or close button.

## Findings

- `components/participants/backfill-modal.tsx` lines 98-99: `onPointerDownOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`
- The modal renders with `open={true}` and no state toggle — it is always-on when unlinked participants exist
- A TD who needs to check participant info, export data, or simply navigate within participants is completely blocked
- The plan document specified blocking on "any tournament page" but implementation is only on participants page (implementation gap per plan)

## Proposed Solutions

### Option A: Add "Skip for now" button (Recommended)
- Add a secondary button: "Skip for now — I'll add phone numbers later"
- When clicked, dismiss the modal for the current session
- The backfill banner/badge on unlinked participants still shows the need
- **Pros**: Unblocks TDs who need to do other work first
- **Cons**: TDs might permanently skip and leave participants unlinked
- **Effort**: Small (add a dismiss button + state variable)
- **Risk**: Low

### Option B: Make modal dismissible with warning
- Allow escape/click-outside but show a toast warning: "X participants still need phone numbers"
- **Pros**: Standard dialog behavior, least friction
- **Cons**: Easy to ignore, potentially defeating the purpose of forcing backfill
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] TD can dismiss the backfill modal without providing all phone numbers
- [ ] Unlinked participants remain visually flagged (badge still shows)
- [ ] Modal reappears on next page visit if unlinked participants still exist
- [ ] Clear warning shown when modal is dismissed with unlinked participants
