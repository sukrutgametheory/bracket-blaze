---
date: 2026-03-06
topic: swiss-mid-event-reclassification
---

# Swiss Mid-Event Reclassification

## What We're Building
An operator policy for when the TD discovers after Swiss Round 1 that an entry was placed in the wrong division, such as a beginner team that should have been intermediate.

The goal is to let the TD revoke that entry with minimal disruption to the rest of the division. The product should preserve tournament flow, avoid redoing completed matches unless absolutely necessary, and make the impact visible and explicit to the TD.

## Why This Approach
The current codebase already has the right primitives for a low-disruption policy:
- `entries.status` supports `withdrawn` and `late_add`
- future Swiss rounds are generated from current active standings
- late additions are already intended to affect only future pairings

That makes a forward-only repair model the simplest and safest default. More invasive options exist, but they should be explicit exceptions because they rewrite results that other players already experienced.

## Approaches

### Recommended: Revoke + Forward-Only Repair
After Round 1, mark the misclassified entry as revoked/withdrawn from the current division. Keep the completed Round 1 result in history and let the valid opponent retain that recorded result, but exclude the revoked entry from future pairing pools so it cannot influence later Swiss draws. Optionally add a swing team or promoted replacement as `late_add` starting in Round 2 with a starting Swiss record of `0-1`.

Pros:
- Lowest disruption to other players
- Matches existing late-add and active-entry patterns
- No need to replay or redraw completed Round 1

Cons:
- Players who faced the revoked entry in Round 1 were still affected once
- Standings policy must be explicit for whether the revoked match still counts

Best when: The priority is keeping the event moving and minimizing collateral damage.

### Option 2: Revoke + Annul Affected Round 1 Result
Treat the entry as invalid for the division. Void its Round 1 match for standings purposes, then generate Round 2 from a repaired standings table that ignores that match. The revoked match remains in the audit log but is marked administrative / excluded.

Pros:
- Fairer to the opponent who got an artificial Round 1 result
- Cleaner competitive interpretation

Cons:
- More complex for TDs to understand
- Requires explicit excluded-result logic in standings, results UI, and audit views
- Can feel like rewriting history mid-event

Best when: Competitive fairness matters more than continuity and operators can tolerate extra complexity.

### Option 3: Full Round 1 Repair / Re-pair
Undo the affected Round 1 match and try to insert a swing team or the moved entry into a repaired Round 1 structure, potentially replaying or reassigning matches.

Pros:
- Closest to a "corrected from the start" tournament

Cons:
- Highest disruption
- Hardest on courts, schedules, and player trust
- Conflicts with the product's bias toward not rewriting completed Swiss flow

Best when: The error is caught almost immediately and the TD is willing to disturb the division heavily.

## Key Decisions
- Default policy should be forward-only, not redraw-heavy: Swiss pairings are generated round by round, so changing only future rounds aligns with current architecture and operator reality.
- Reclassification should be modeled as an administrative revocation, not a silent delete: the audit trail matters because a real match may already have been played.
- The already-played Round 1 result should remain counted as historical fact: the valid opponent keeps that result, but the revoked entry must not affect any future Swiss draws.
- Replacement entry should be optional: the TD may revoke without replacement, or insert a swing/reclassified entry for future rounds only.
- Replacement `late_add` entries should begin at `0-1`: this keeps them aligned with having missed Round 1 while avoiding a misleading fresh `0-0` record.
- Any repair more invasive than forward-only should require explicit TD confirmation: it affects players who already completed a valid-on-the-day match.

## Resolved Questions
- If a swing team enters in Round 2, it should start with a Swiss record of `0-1`.
- Moved teams should not be auto-created in the destination division: adding them to intermediate should remain a separate explicit TD action.
- The already-played Round 1 result should still count as historical fact, as long as the revoked entry is excluded from all future draw generation.

## Next Steps
→ `/prompts:workflows-plan` for implementation details.
