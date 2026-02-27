-- Tighten RLS policies on bracket_blaze_players.
-- Previous policies allowed ANY authenticated user to SELECT/INSERT/UPDATE all player records.
-- New policies restrict access to tournament directors (users who own at least one tournament).

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view players" ON bracket_blaze_players;
DROP POLICY IF EXISTS "Authenticated users can create players" ON bracket_blaze_players;
DROP POLICY IF EXISTS "Authenticated users can update players" ON bracket_blaze_players;

-- Helper: check if the current user is a tournament director (owns at least one tournament)
CREATE OR REPLACE FUNCTION bracket_blaze_is_tournament_director()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM bracket_blaze_tournaments
        WHERE created_by = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECT: Only TDs can look up players (needed for phone lookup during participant creation)
CREATE POLICY "Tournament directors can view players"
    ON bracket_blaze_players FOR SELECT
    USING (bracket_blaze_is_tournament_director());

-- INSERT: Only TDs can create player records (via find-or-create during participant creation)
CREATE POLICY "Tournament directors can create players"
    ON bracket_blaze_players FOR INSERT
    WITH CHECK (bracket_blaze_is_tournament_director());

-- UPDATE: Only TDs can update player records (via find-or-create ON CONFLICT and last-write-wins)
CREATE POLICY "Tournament directors can update players"
    ON bracket_blaze_players FOR UPDATE
    USING (bracket_blaze_is_tournament_director());
