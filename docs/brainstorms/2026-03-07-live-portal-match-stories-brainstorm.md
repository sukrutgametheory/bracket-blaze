---
topic: Live Portal Match Stories
date: 2026-03-07
status: complete
---

# Live Portal Match Stories

## What We're Building

Add a spectator-facing story layer to the public live portal match feed at `/live/[tournamentId]`. Each match gets short, generated commentary that helps a remote spectator understand why the matchup matters without needing prior tournament context.

Stories are match-scoped artifacts, not per-click or per-view generations. A match should have a pre-match story available once it reaches `on_court`, and that story should switch to a short post-match recap once the result is known. On the live page, the story appears inside the existing match card as an expandable section.

## Why This Approach

We chose a dedicated story layer per match instead of storing a single text blob directly in the match record. That keeps commentary as a first-class tournament artifact with its own lifecycle: pre-match generation, post-match recap generation, retries, and future editing/versioning if needed.

This also fits the current live portal well. The page is already a compact mobile-first match feed, so the core match card should remain score-first while the story stays optional behind an inline expand action. That preserves quick scanning while adding richer spectator context.

## Key Decisions

- `Audience`: Spectator delight. The copy should contextualize matches for people who are not physically present at the tournament.
- `Placement`: The story lives in an expandable section inside each live portal match card, not in a separate detail screen.
- `Lifecycle`: Every match can have two story states:
  - Pre-match story for matches that are `on_court`
  - Post-match recap for matches that are `completed` or `walkover`
- `Generation timing`: Stories are generated per match as part of tournament flow, not on user click and not on every page view.
- `Visibility on live portal`: Stories should only appear once a match is on court, then switch to a post-match recap after completion.
- `Length and tone`: 2-4 short sentences, spectator-friendly, lightly polished, with emojis used sparingly.
- `Story inputs`: Commentary should use available tournament context such as tournament name, round, division, earlier Swiss results, dominant wins, recovery arcs after losses, and head-to-head history when present.
- `Round handling`: Round 1 should still get meaningful generic framing tied to tournament and division context even with no prior match history.
- `Knockout handling`: If a knockout match is not yet fully resolved, the story should describe the possible players or teams who could emerge into that slot rather than staying generic.
- `Finals treatment`: Finals should get extra polish and higher-stakes framing, but still remain within the same short card-story format.
- `Model requirement`: Use OpenRouter with `openai/gpt-oss-120b` for generation.

## Resolved Questions

- `Primary purpose?` Spectator delight, not player utility.
- `Live-updating or static while match is active?` Pre-match only while active.
- `Generate on click or ahead of time?` Ahead of time, per match.
- `What about unresolved knockout matches?` Frame the matchup around the players or teams who could make it.
- `Where does the story appear?` Inline expandable section in the match card.
- `What happens after completion?` Replace pre-match context with a post-match recap.
- `How long should it be?` 2-4 short sentences.
- `Should stories appear for scheduled matches?` No. Only when on court, then as recap after completion.
- `Which model should be used?` `openai/gpt-oss-120b` via OpenRouter.

## Open Questions

None for this brainstorm. Implementation planning can proceed.

## Next Steps

Move to planning to define:

- The match-story data model and lifecycle states
- When stories are generated or regenerated during draw and result flows
- How the live portal card expands and renders story content
- Failure handling, retries, and fallback copy behavior
