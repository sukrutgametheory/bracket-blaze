---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# Overly Permissive RLS Policies in Phase 3 Migration

## Problem Statement

The Phase 3 migration creates RLS policies that allow any authenticated user to SELECT, INSERT, UPDATE, and DELETE on `match_conflicts` and `court_assignments` tables. There's no scoping to tournament ownership. Any logged-in user can modify any tournament's data.

## Findings

- `supabase/migrations/20250103000001_phase3_swiss_knockout.sql`:
  - `USING (auth.uid() IS NOT NULL)` on all policies - only checks "is logged in", not "owns this tournament"
  - Missing DELETE policy on `court_assignments` (inconsistent with other tables)
  - No foreign key chain enforcement to verify the user is the TD for the tournament

## Proposed Solutions

### Option A: Scope RLS to tournament ownership (Recommended)
- Add a subquery: `USING (EXISTS (SELECT 1 FROM bracket_blaze_tournaments t WHERE t.id = tournament_id AND t.user_id = auth.uid()))`
- Apply to INSERT, UPDATE, DELETE policies
- Keep SELECT broader for read access (spectators need to see assignments)
- **Pros**: Proper security boundary
- **Cons**: Slightly more complex policies
- **Effort**: Small
- **Risk**: Low

### Option B: Keep permissive, fix in application layer
- Rely on server action auth checks (see todo #001)
- **Pros**: Simpler SQL
- **Cons**: Defense in depth principle violated
- **Effort**: None
- **Risk**: High - single layer of defense

## Acceptance Criteria

- [ ] Write RLS policies scope mutations to tournament owner
- [ ] SELECT policies allow read access for authenticated users (spectators)
- [ ] DELETE policy exists for `court_assignments`
- [ ] Policies tested with non-owner user

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-21 | Created from code review | RLS only checks `auth.uid() IS NOT NULL` |
