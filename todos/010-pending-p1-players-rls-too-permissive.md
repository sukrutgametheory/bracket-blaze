---
status: complete
priority: p1
issue_id: "010"
tags: [code-review, security, rls]
dependencies: []
---

# Players Table RLS Policies Expose PII to All Authenticated Users

## Problem Statement

The `bracket_blaze_players` table RLS policies grant SELECT, INSERT, and UPDATE access to ANY authenticated user. This means any user who creates an account can harvest every phone number, email, and name in the global player registry. Phone numbers are PII protected under GDPR and India's DPDP Act. Additionally, any authenticated user can overwrite any player's display_name, email, and club via the `bracket_blaze_find_or_create_player` RPC function.

## Findings

- `supabase/migrations/20250106000001_create_players_table.sql` lines 32-42: Three policies all use `auth.role() = 'authenticated'` with no further scoping
- SELECT policy exposes all 125+ player phone numbers to any logged-in user
- UPDATE policy allows any user to modify any global player record
- INSERT policy allows any user to create player records (less concerning but still overly broad)
- The `find_or_create_player` function uses `ON CONFLICT DO UPDATE`, meaning calling it with an existing phone silently overwrites that player's profile
- Contrast: Other tables (tournaments, courts, divisions) use `bracket_blaze_is_tournament_admin()` to restrict writes

## Proposed Solutions

### Option A: Scope to tournament admin via participant link (Recommended)
- SELECT: Allow reading players only when the current user is the admin of a tournament that has a participant linked to that player
- UPDATE: Same scoping as SELECT
- INSERT: Keep authenticated-only (creating new players is the normal flow)
- **SQL:**
```sql
CREATE POLICY "TDs can view their tournament players"
    ON bracket_blaze_players FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_participants p
            JOIN bracket_blaze_tournaments t ON t.id = p.tournament_id
            WHERE p.player_id = bracket_blaze_players.id
            AND t.created_by = auth.uid()
        )
    );
```
- **Pros**: Tight scoping, only exposes PII to relevant TDs
- **Cons**: Subquery on every SELECT — performance impact at scale (mitigated by indexes)
- **Effort**: Small
- **Risk**: Low — straightforward policy replacement

### Option B: Allow all authenticated for SELECT, restrict UPDATE
- Keep SELECT as-is (any authenticated user can read players)
- Restrict UPDATE to tournament admins only
- **Pros**: Simpler, allows phone lookup for any authenticated user (needed for participant creation)
- **Cons**: Still exposes all PII to all users
- **Effort**: Small
- **Risk**: Medium — PII still broadly readable

## Acceptance Criteria
- [ ] SELECT on bracket_blaze_players is scoped (not open to all authenticated users)
- [ ] UPDATE on bracket_blaze_players is scoped to tournament admins
- [ ] INSERT policy verified appropriate
- [ ] Phone lookup in participant-dialog still works for TDs creating participants
- [ ] Backfill modal still works for TDs linking participants
