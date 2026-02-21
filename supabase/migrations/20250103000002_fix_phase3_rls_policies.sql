-- Fix Phase 3 RLS policies: scope write operations to tournament owner
-- instead of just checking auth.uid() IS NOT NULL

-- Drop overly permissive match_conflicts policies
DROP POLICY IF EXISTS "match_conflicts_insert" ON bracket_blaze_match_conflicts;
DROP POLICY IF EXISTS "match_conflicts_update" ON bracket_blaze_match_conflicts;

-- Recreate with tournament-scoped write policies
-- Only the tournament creator can insert/update conflict records
CREATE POLICY "match_conflicts_insert"
    ON bracket_blaze_match_conflicts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "match_conflicts_update"
    ON bracket_blaze_match_conflicts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

-- Drop overly permissive court_assignments policies
DROP POLICY IF EXISTS "court_assignments_insert" ON bracket_blaze_court_assignments;
DROP POLICY IF EXISTS "court_assignments_update" ON bracket_blaze_court_assignments;

-- Recreate with tournament-scoped write policies
CREATE POLICY "court_assignments_insert"
    ON bracket_blaze_court_assignments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "court_assignments_update"
    ON bracket_blaze_court_assignments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

-- Add missing DELETE policy for court_assignments (scoped to tournament owner)
CREATE POLICY "court_assignments_delete"
    ON bracket_blaze_court_assignments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );
