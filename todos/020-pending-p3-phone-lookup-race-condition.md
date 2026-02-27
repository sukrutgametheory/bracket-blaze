---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, quality, react]
dependencies: []
---

# Phone Lookup Race Condition in Participant Dialog

## Problem Statement

The `handlePhoneLookup` function fires on blur with no cancellation of in-flight requests. If a user rapidly clicks in and out of the phone field, a stale response from an earlier lookup could overwrite form values after a more recent lookup has already completed.

## Findings

- `components/participants/participant-dialog.tsx` lines 89-128: `handlePhoneLookup` fires on `onBlur` with no request ID or AbortController
- No debouncing (though blur-based trigger is naturally infrequent)
- A stale `findPlayerByPhone` response could call `form.setValue` after a newer response already populated the form

## Proposed Solutions

### Option A: Add request counter to discard stale results (Recommended)
- Use a `useRef` counter incremented on each lookup
- If the counter has changed by the time the response arrives, discard the result
- **Effort**: Small (5 lines)
- **Risk**: Low

## Acceptance Criteria
- [ ] Stale phone lookup responses are discarded
- [ ] Most recent lookup result always wins
- [ ] No visual flicker from stale response overwriting current values
