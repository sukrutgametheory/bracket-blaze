---
title: "feat: Add Swiss Top 12 Pre Quarter Knockout"
type: feat
status: completed
date: 2026-03-06
origin: docs/brainstorms/2026-03-06-swiss-top-12-pre-quarter-brainstorm.md
---

# feat: Add Swiss Top 12 Pre Quarter Knockout

## Overview

Add explicit support for a Swiss-only knockout option: `Top 12 (Pre Quarter)`.

This extends the existing Swiss-to-knockout flow so tournament directors can select a special 12-qualifier bracket shape where seeds 1-4 receive byes into the quarter-finals and seeds 5-12 play a `Pre Quarter` round first. The feature must remain intentionally narrow: it should preserve all existing power-of-2 knockout behavior for other qualifier counts and should not introduce a generalized non-power-of-2 bracket engine. This scope and rationale come directly from the brainstorm (see brainstorm: `docs/brainstorms/2026-03-06-swiss-top-12-pre-quarter-brainstorm.md`).

## Problem Statement

The current system assumes that Swiss knockout qualifiers are always a power of 2.

That assumption is enforced in validation, bracket generation, and round labeling:
- `lib/validations/tournament.ts` rejects Swiss qualifier counts that are not powers of 2.
- `lib/services/draw-generators/knockout-engine.ts` throws unless qualifier count is a power of 2.
- `lib/actions/draws.ts` stores only generic knockout state (`phase`, `bracket_size`) and generates brackets through the standard engine.
- Control center and live portal components use duplicated generic knockout label helpers that would render the first round as `Round of 16`, not `Pre Quarter`.

As a result, the requested tournament format cannot be configured or displayed correctly today.

## Proposed Solution

Implement a narrow Swiss-specific bracket variant for `Top 12 (Pre Quarter)` with three coordinated changes:

1. **Explicit configuration path**
   Replace the current free-form Swiss qualifier number input with an explicit qualifier option model that includes `0`, standard power-of-2 counts, and a dedicated `Top 12 (Pre Quarter)` option. Store the numeric qualifier count plus an explicit bracket variant in `rules_json` so the behavior is transparent and backward-compatible.

2. **Specialized knockout generation path for 12 qualifiers**
   Extend knockout generation to support one additional bracket shape:
   - Pre Quarter: `5 vs 12`, `6 vs 11`, `7 vs 10`, `8 vs 9`
   - Quarter-Final: seeds `1-4` join the four Pre Quarter winners as seeds `1-8`
   - Semi-Final and Final proceed as normal

3. **Shared bracket metadata and labeling**
   Carry bracket variant metadata into draw state so every knockout surface can label rounds consistently. Centralize knockout round labeling so `Pre Quarter` appears in control center standings, results, round filters, and live portal match cards without per-component guesswork.

## Technical Approach

### Architecture

Use a data-driven bracket variant rather than a special case hidden behind the number `12`.

Recommended shape:
- `rules_json.swiss_qualifiers`: numeric qualifier count (`0`, a supported standard power-of-2 knockout size, or `12` for the explicit Pre Quarter variant)
- `rules_json.swiss_knockout_variant`: `'standard' | 'pre_quarter_12'`
- `draw.state_json.knockout_variant`: `'standard' | 'pre_quarter_12'`
- `draw.state_json.bracket_size`: numeric qualifier count

Why this shape:
- Preserves existing reads of `swiss_qualifiers`
- Makes the special behavior explicit in setup and persisted state
- Avoids inferring `Pre Quarter` from round count alone, which is unreliable across current UI surfaces
- Keeps other formats unchanged (see brainstorm: `docs/brainstorms/2026-03-06-swiss-top-12-pre-quarter-brainstorm.md`)

### Implementation Phases

#### Phase 1: Swiss Configuration Model

Update Swiss division setup to expose an explicit qualifier option instead of relying on a raw numeric field.

Deliverables:
- Update `lib/validations/tournament.ts` so Swiss validation allows:
  - `0`
  - power-of-2 qualifier counts using the existing standard knockout path
  - `12` only when paired with the explicit Swiss knockout variant
- Extend `divisionFormSchema` with a Swiss knockout variant field
- Update `components/divisions/division-dialog.tsx` to render an explicit knockout option selector for Swiss divisions
- Persist both `swiss_qualifiers` and `swiss_knockout_variant` into `rules_json`
- Update `components/divisions/division-list.tsx` so division summaries show `Top 12 (Pre Quarter)` rather than `Top 12 to knockout`

Success criteria:
- TD can select `Top 12 (Pre Quarter)` during division setup
- Raw `12` is not treated as a silent hidden mode
- Existing Swiss divisions with standard qualifier counts still load and save correctly

#### Phase 2: Draw State and Bracket Generation

Extend knockout generation for the single supported non-power-of-2 case.

Deliverables:
- Refactor `lib/services/draw-generators/knockout-engine.ts` to support two variants:
  - standard seeded knockout for power-of-2 qualifier counts
  - explicit `pre_quarter_12` bracket generation
- For `pre_quarter_12`, generate all knockout matches and linkages in a deterministic seeded layout:
  - Round 1 (`Pre Quarter`): 4 matches
  - Round 2 (`Quarter-Final`): 4 matches
  - Round 3 (`Semi-Final`): 2 matches
  - Round 4 (`Final`): 1 match
- Ensure seeds 1-4 populate quarter-final slots directly and round-1 winners feed into quarter-final slots 5-8 in seeded order (winner of `5 vs 12` -> seed 5, `6 vs 11` -> seed 6, `7 vs 10` -> seed 7, `8 vs 9` -> seed 8)
- Update `lib/actions/draws.ts` so `generateKnockoutDraw()` reads the configured bracket variant, invokes the correct generator, and writes `knockout_variant` + `bracket_size` into draw state
- Keep existing knockout advancement semantics unchanged: winners advance through `next_match_id` and `next_match_side`

Success criteria:
- `Top 12 (Pre Quarter)` generates exactly 11 knockout matches
- Seeds 1-4 do not appear in Pre Quarter matches
- Quarter-final pairings resolve as `1 vs 8`, `2 vs 7`, `3 vs 6`, `4 vs 5`
- Standard 2/4/8/16/32 qualifier generation still behaves exactly as before

#### Phase 3: Shared Round Labeling and Surface Parity

Make round labels consistent everywhere the user can see knockout matches.

Deliverables:
- Introduce a shared helper for knockout round labels, driven by `round`, `totalRounds`, and `knockoutVariant`
- Replace duplicated label logic in:
  - `components/control-center/standings-section.tsx`
  - `components/control-center/results-section.tsx`
  - `components/live-portal/match-card.tsx`
- Update round filters and bracket headings to display `Pre Quarter` when applicable
- Ensure live portal receives bracket-variant context from draw state instead of guessing from `match.round`

Success criteria:
- The first round of a 12-qualifier knockout is labeled `Pre Quarter` on all screens
- Standard knockout rounds still render `Quarter-Final`, `Semi-Final`, `Final`, or generic `Round of N` labels correctly
- No surface uses one-off local logic that can drift from the others

#### Phase 4: Testing and Regression Coverage

Add focused tests around the new variant and existing paths.

Deliverables:
- Unit tests for Swiss validation rules
- Unit tests for knockout generator output and feed-through mapping
- Regression tests for existing power-of-2 bracket generation
- Integration coverage for full Swiss completion -> knockout generation -> result advancement
- UI-level assertions for visible labels and summaries where practical

Success criteria:
- The new 12-qualifier path is covered end-to-end
- Existing knockout behavior is explicitly protected against regressions

## Alternative Approaches Considered

### 1. General byes-based knockout generator

Rejected.

This would solve the current need and future non-power-of-2 cases, but it expands the feature from a targeted tournament format request into a broader bracket architecture project. That adds more validation combinations, more UI ambiguity, and a much larger test matrix than the user asked for (see brainstorm: `docs/brainstorms/2026-03-06-swiss-top-12-pre-quarter-brainstorm.md`).

### 2. Accept raw numeric `12` and infer the special case implicitly

Rejected.

This hides important tournament behavior behind an otherwise generic numeric field. It would make setup less clear, complicate editing/debugging, and force the rest of the application to infer semantics from the number alone.

### 3. Swiss-only arbitrary qualifier counts

Rejected.

This is narrower than a full generalized engine but still overreaches the stated need. The plan should support exactly one new special case: Swiss `Top 12 (Pre Quarter)`.

## System-Wide Impact

### Interaction Graph

Swiss division setup affects more than bracket generation:

1. TD edits division settings in `components/divisions/division-dialog.tsx`
2. `createDivision()` / `updateDivision()` persist `rules_json`
3. `generateDraw()` copies Swiss configuration into `draw.state_json`
4. `generateKnockoutDraw()` reads qualifier count and bracket variant from draw state / rules
5. Knockout matches are created with `next_match_id` / `next_match_side`
6. Result entry in `lib/actions/matches.ts` advances winners through the knockout tree
7. Control center standings/results and live portal surfaces render round labels from knockout metadata

The plan must keep those layers aligned so the special bracket mode is explicit from setup through display.

### Error & Failure Propagation

Primary failure cases:
- Invalid Swiss config should be rejected before division save or draw generation
- Bracket generation should fail fast if variant/count combinations are inconsistent
- Label helpers should have a safe standard fallback for old draw states that lack `knockout_variant`
- Partial failure during knockout creation must not leave matches inserted without updated `next_match_id` references

Mitigation:
- Validate variant/count pairs centrally
- Build all knockout match structures before insert
- Prefer batched linkage updates over sequential `await` loops where possible
- Only update draw state after matches and linkages are written successfully

### State Lifecycle Risks

Persisted state touched by this feature:
- `division.rules_json`
- `draw.state_json`
- knockout rows in `bracket_blaze_matches`

Risks:
- `rules_json` and draw state drifting apart on knockout variant
- Partially generated knockout trees if linkage updates fail after match insertion
- Old UI surfaces mislabeling matches because they infer labels from round counts rather than explicit metadata

Mitigation:
- Treat `draw.state_json` as the runtime source of truth once Swiss draw exists
- Copy `swiss_knockout_variant` into draw state during draw creation / knockout generation
- Centralize round-label logic in one helper

### API Surface Parity

Interfaces that must agree:
- Swiss division form validation
- division create/update server actions
- draw generation server action
- knockout engine service
- control center standings view
- control center results view
- live portal match cards
- division list summary text

No changes are planned for:
- Mexicano
- Groups -> Knockout
- referee scoring flow
- Court TV

### Integration Test Scenarios

1. Create a Swiss division with `Top 12 (Pre Quarter)`, generate Swiss draw, complete Swiss rounds, and generate knockout. Verify 11 knockout matches and correct seed placement.
2. Complete all four Pre Quarter matches and verify quarter-finals populate as `1 vs 8`, `2 vs 7`, `3 vs 6`, `4 vs 5`.
3. Edit scores on a completed Pre Quarter or quarter-final match and verify knockout advancement remains correct under existing winner-change guards.
4. Generate a standard 8-qualifier knockout after the feature lands and verify labels, seeding, and advancement are unchanged.
5. Open control center and live portal for the same 12-qualifier division and verify both show `Pre Quarter` consistently.

## SpecFlow Findings

### User Flow Coverage

Primary flows:
1. TD selects `Top 12 (Pre Quarter)` while configuring a Swiss division.
2. Swiss rounds run normally and standings compute top 12 qualifiers.
3. TD generates knockout after Swiss completion.
4. TD and players view the new bracket with `Pre Quarter` as the first knockout round.
5. Match completion advances winners into quarter-finals, then semis, then final.

### Gaps Identified During Planning

1. **Configuration clarity gap**
   The current form only captures a number for Swiss qualifiers. The plan resolves this by storing explicit bracket variant metadata.

2. **Label parity gap**
   Multiple components currently implement their own knockout round label helper. The plan resolves this by introducing one shared helper.

3. **Live portal context gap**
   `components/live-portal/match-card.tsx` currently guesses knockout labels from `match.round` alone. The plan resolves this by providing draw-based variant context instead of guesswork.

4. **Backward-compatibility gap**
   Existing saved draws and divisions do not contain `swiss_knockout_variant` / `knockout_variant`. The plan assumes default fallback to `'standard'` when fields are absent.

### Planning Assumptions

- No schema migration is required if variant metadata can live in existing JSON blobs (`rules_json`, `state_json`).
- Existing divisions and draw states without variant metadata should continue to behave as standard knockout divisions.
- The explicit UI option should still persist `swiss_qualifiers = 12` so standings highlighting remains simple.

## Acceptance Criteria

### Functional Requirements

- [x] Swiss division setup exposes an explicit `Top 12 (Pre Quarter)` option.
- [x] Selecting that option persists enough metadata to distinguish it from a standard numeric qualifier count.
- [x] Swiss validation accepts `12` only for the explicit Pre Quarter variant.
- [x] `generateKnockoutDraw()` can generate a 12-qualifier bracket with top-4 byes.
- [x] Pre Quarter round pairings are `5 vs 12`, `6 vs 11`, `7 vs 10`, `8 vs 9`.
- [x] Pre Quarter winners feed quarter-final seeds `5-8` so the quarter-finals are `1 vs 8`, `2 vs 7`, `3 vs 6`, `4 vs 5`.
- [x] Control center standings show the correct knockout bracket and final Swiss standings for this variant.
- [x] Control center results round filters and labels show `Pre Quarter` where applicable.
- [x] Live portal match cards and standings surfaces also show `Pre Quarter` consistently.
- [x] Existing standard Swiss knockout paths remain unchanged for all supported power-of-2 qualifier counts.

### Non-Functional Requirements

- [x] The feature does not broaden support to other non-power-of-2 qualifier counts.
- [x] Knockout generation does not add new avoidable sequential-write bottlenecks beyond current behavior.
- [x] Old divisions/draw states without variant metadata render safely via standard fallbacks.

### Quality Gates

- [ ] Unit tests cover validation rules for standard vs `pre_quarter_12` Swiss configs.
- [ ] Unit tests cover knockout match structure and linkage for the 12-qualifier variant.
- [ ] Regression tests cover standard power-of-2 knockout generation.
- [ ] Manual verification confirms label parity across control center and live portal.

## Success Metrics

- TD can configure and run a Swiss `Top 12 (Pre Quarter)` tournament without manual bracket workarounds.
- All visible knockout surfaces show `Pre Quarter` consistently for this variant.
- Existing Swiss knockout tournaments with standard qualifier counts continue to function without data migration.
- No new bracket-generation regressions are introduced for standard knockout sizes.

## Dependencies & Prerequisites

- Existing Swiss standings and knockout winner advancement remain the foundation.
- Control center and live portal continue consuming draw state and match data from current queries.
- If tests do not exist for current knockout generation, they should be added before or alongside the variant work to anchor regressions.

## Risk Analysis & Mitigation

1. **Risk: Implicit mode leakage**
   If `12` is accepted without explicit metadata, the app can drift into ambiguous behavior.
   Mitigation: persist explicit bracket variant in `rules_json` and `state_json`.

2. **Risk: UI label drift across surfaces**
   Three components currently implement round labels separately.
   Mitigation: move to a shared helper and update all knockout label call sites.

3. **Risk: Bracket linkage bugs in quarter-final seeding**
   The new variant introduces bye-aware feed-ins.
   Mitigation: add generator tests that assert exact match slots and next-match mapping.

4. **Risk: Performance regression in knockout generation**
   Existing code already performs sequential `next_match_id` updates.
   Mitigation: keep the feature scoped, and if touching linkage writes, prefer batching instead of expanding sequential loops. This is supported by the local performance learnings in `docs/solutions/2026-02-22-n1-query-performance-analysis.md`.

## Resource Requirements

- 1 engineer familiar with the existing Swiss/knockout implementation
- Existing local development environment only
- No new infrastructure or third-party dependency

## Future Considerations

Explicitly deferred:
- generalized non-power-of-2 knockout support
- Mexicano or Groups -> Knockout adoption of the same bracket variant
- arbitrary play-in sizes beyond 12 qualifiers
- more advanced bracket metadata or custom bracket editors

If more bracket shapes are needed later, this feature should become the first step toward a small bracket-variant system rather than accumulating more ad hoc numeric exceptions.

## Documentation Plan

Update or create the following as part of implementation:
- Swiss knockout rules description in any relevant operator-facing docs if present
- Inline comments in the knockout engine where the 12-qualifier variant differs from the standard generator
- Plan/progress notes if the team tracks feature completion in `PROGRESS.md`

## Sources & References

### Origin

- **Brainstorm document:** `docs/brainstorms/2026-03-06-swiss-top-12-pre-quarter-brainstorm.md`
  Key decisions carried forward:
  - Swiss only
  - exact support for `Top 12 (Pre Quarter)` only
  - explicit option in setup rather than hidden numeric behavior
  - `Pre Quarter` must be the visible label everywhere

### Internal References

- Validation currently enforces power-of-2 Swiss qualifiers: `lib/validations/tournament.ts:28-69`
- Swiss division setup currently uses a numeric qualifier input: `components/divisions/division-dialog.tsx:341-395`
- Division summaries currently render generic qualifier text: `components/divisions/division-list.tsx:111-123`
- Standard knockout generator rejects non-power-of-2 sizes and uses generic labels: `lib/services/draw-generators/knockout-engine.ts:85-184`
- Knockout draw generation uses the standard generator and sequential linkage updates: `lib/actions/draws.ts:388-515`
- Control center standings have local knockout label logic: `components/control-center/standings-section.tsx:42-52`
- Control center results have separate label logic and round filters: `components/control-center/results-section.tsx:48-54`
- Live portal match cards currently guess knockout labels from match round alone: `components/live-portal/match-card.tsx:14-20`, `components/live-portal/match-card.tsx:44-49`
- Division create/update persists `rules_json` without extra schema handling: `lib/actions/divisions.ts:1-90`

### Institutional Learnings

- `docs/solutions/2026-02-22-n1-query-performance-analysis.md`
  Relevant takeaway: knockout generation already has known sequential `next_match_id` update debt; avoid expanding that pattern while adding the new variant.
- `docs/solutions/README.md`
  Relevant takeaway: draw generation and knockout linkage are already called out as optimization candidates, so this feature should preserve or improve current write patterns rather than worsen them.

### Related Work

- Previous Swiss -> knockout planning: `docs/plans/2026-02-21-feat-swiss-knockout-draw-generation-plan.md`
- Public live portal plan reusing control-center standings patterns: `docs/plans/2026-02-22-feat-public-live-portal-plan.md`
