---
status: pending
priority: p2
issue_id: "004"
tags: [code-review, quality, typescript]
dependencies: []
---

# ~20+ `any` Type Casts Throughout Phase 3 Code

## Problem Statement

Phase 3 code uses `any` extensively for Supabase client types, component props, and match data. This defeats TypeScript's type safety and allows bugs to slip through undetected.

## Findings

- `lib/actions/matches.ts` - `supabase` parameter typed as `any` in `advanceKnockoutWinner`
- `lib/actions/draws.ts` - Multiple `.select("*") as any` patterns
- `components/control-center/control-center-client.tsx` - `matches: any[]` prop
- `components/control-center/court-grid.tsx` - `matches: any[]` prop
- `components/control-center/round-management.tsx` - `matches: any[]`, `draws: { state_json: any }`
- `components/control-center/ready-queue.tsx` - likely `matches: any[]`
- `types/database.ts` - Missing `bye?: boolean` on `MatchScoreData` interface (bye is written to meta_json but not typed)

## Proposed Solutions

### Option A: Create proper match response types (Recommended)
- Define `MatchWithRelations` type for the joined match query response
- Define `DrawStateRecord` type for draw state JSON
- Replace `any[]` props with typed arrays
- Type the Supabase client as `SupabaseClient` from `@supabase/supabase-js`
- Add `bye?: boolean` to `MatchScoreData`
- **Pros**: Full type safety, better IDE support, catches bugs at compile time
- **Cons**: Some effort to define all shapes
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] Zero `any` types in Phase 3 server actions
- [ ] Component props use typed interfaces instead of `any[]`
- [ ] `MatchScoreData` includes `bye?: boolean`
- [ ] `DrawState` interface shared between components

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | ~20+ any casts across Phase 3 files |
