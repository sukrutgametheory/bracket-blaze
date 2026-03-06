---
topic: Swiss Top 12 Pre Quarter Knockout
date: 2026-03-06
status: complete
---

# Swiss Top 12 Pre Quarter Knockout

## What We're Building

Add a new Swiss knockout qualification option that explicitly supports `Top 12 (Pre Quarter)`.

This option applies only to Swiss divisions. After Swiss standings are finalized, the top 12 entries qualify for knockout. Seeds 1-4 receive a bye into the quarter-finals. Seeds 5-12 play a Pre Quarter round using standard seeding: 5 vs 12, 6 vs 11, 7 vs 10, and 8 vs 9. The four winners fill quarter-final seeds 5-8, after which the bracket proceeds normally: 1 vs 8, 2 vs 7, 3 vs 6, and 4 vs 5.

## Why This Approach

This should be implemented as a narrow product feature, not a general non-power-of-2 bracket system.

Three approaches were considered:

1. **General byes-based knockout generator**: flexible, but much broader than the stated need and would expand validation, UI, labels, and testing across all formats.
2. **Swiss-only support for arbitrary qualifier counts**: narrower than a full generalized bracket engine, but still introduces extra product surface and ambiguity the user did not ask for.
3. **Explicit Swiss `Top 12 (Pre Quarter)` option**: recommended because it exactly matches the tournament format needed, preserves current power-of-2 assumptions elsewhere, and avoids overbuilding.

## Key Decisions

1. **Scope**: Swiss only.
   Rationale: this requirement is currently needed only for Swiss, so other formats remain unchanged.

2. **Configuration model**: expose an explicit option, not a plain numeric `12`.
   Rationale: `12` has special behavior. The UI should make that behavior obvious instead of hiding it behind a number field that currently implies a standard knockout.

3. **Bracket behavior**: top 4 seeds receive byes; seeds 5-12 play the Pre Quarter round.
   Rationale: this matches the requested tournament logic and preserves seeding fairness.

4. **Pre Quarter pairings**: `5 vs 12`, `6 vs 11`, `7 vs 10`, `8 vs 9`.
   Rationale: standard high-vs-low seeding for the play-in round.

5. **Quarter-final mapping**: Pre Quarter winners become quarter-final seeds 5-8, then quarters run as `1 vs 8`, `2 vs 7`, `3 vs 6`, `4 vs 5`.
   Rationale: keeps the later knockout path identical to the normal seeded quarter-final structure.

6. **Labeling**: use `Pre Quarter` explicitly in the product.
   Rationale: the user wants a domain-specific label rather than a generic bracket-size label.

7. **Existing rules stay intact elsewhere**: current power-of-2 knockout assumptions remain the default for all other knockout generation paths.
   Rationale: keeps this feature small and avoids unintended behavior changes.

## Resolved Questions

- **Should this apply to all formats?** No, Swiss only.
- **Should this be generalized beyond 12 qualifiers?** No, exact support for 12 only.
- **Should the UI show a special option or just allow `12`?** Special explicit option.
- **What should the opening knockout round be called?** `Pre Quarter`.

## Open Questions

None.

## Next Steps

Move to planning with a narrow implementation scope:
- update Swiss division configuration to expose the explicit `Top 12 (Pre Quarter)` option
- adjust validation so this special Swiss path is allowed without relaxing rules globally
- add bracket generation support for the Pre Quarter round and quarter-final feed-ins
- update knockout round labels and displays so `Pre Quarter` appears consistently
- add tests for seeding, bracket progression, and regression coverage for existing power-of-2 knockouts
