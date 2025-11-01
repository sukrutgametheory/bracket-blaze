-- Enable Row Level Security on all prefixed tables
ALTER TABLE bracket_blaze_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_official_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_blaze_standings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is tournament director/admin
CREATE OR REPLACE FUNCTION bracket_blaze_is_tournament_admin(tournament_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM bracket_blaze_tournaments
        WHERE id = tournament_uuid
        AND created_by = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is assigned as official for a match
CREATE OR REPLACE FUNCTION bracket_blaze_is_match_official(match_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM bracket_blaze_official_assignments
        WHERE match_id = match_uuid
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TOURNAMENTS POLICIES
CREATE POLICY "Anyone can view tournaments"
    ON bracket_blaze_tournaments FOR SELECT
    USING (status != 'draft' OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create tournaments"
    ON bracket_blaze_tournaments FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Tournament creator can update"
    ON bracket_blaze_tournaments FOR UPDATE
    USING (created_by = auth.uid());

CREATE POLICY "Tournament creator can delete"
    ON bracket_blaze_tournaments FOR DELETE
    USING (created_by = auth.uid());

-- COURTS POLICIES
CREATE POLICY "Anyone can view courts"
    ON bracket_blaze_courts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_tournaments
            WHERE id = bracket_blaze_courts.tournament_id
            AND (status != 'draft' OR created_by = auth.uid())
        )
    );

CREATE POLICY "Tournament admin can insert courts"
    ON bracket_blaze_courts FOR INSERT
    WITH CHECK (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update courts"
    ON bracket_blaze_courts FOR UPDATE
    USING (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can delete courts"
    ON bracket_blaze_courts FOR DELETE
    USING (bracket_blaze_is_tournament_admin(tournament_id));

-- DIVISIONS POLICIES
CREATE POLICY "Anyone can view published divisions"
    ON bracket_blaze_divisions FOR SELECT
    USING (
        is_published = true OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_tournaments
            WHERE id = bracket_blaze_divisions.tournament_id
            AND created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can insert divisions"
    ON bracket_blaze_divisions FOR INSERT
    WITH CHECK (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update divisions"
    ON bracket_blaze_divisions FOR UPDATE
    USING (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can delete divisions"
    ON bracket_blaze_divisions FOR DELETE
    USING (bracket_blaze_is_tournament_admin(tournament_id));

-- PARTICIPANTS POLICIES
CREATE POLICY "Anyone can view participants"
    ON bracket_blaze_participants FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create participants"
    ON bracket_blaze_participants FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own participant profile"
    ON bracket_blaze_participants FOR UPDATE
    USING (user_id = auth.uid());

-- ENTRIES POLICIES
CREATE POLICY "Anyone can view entries"
    ON bracket_blaze_entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions
            WHERE id = bracket_blaze_entries.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = bracket_blaze_entries.division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can insert entries"
    ON bracket_blaze_entries FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can update entries"
    ON bracket_blaze_entries FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can delete entries"
    ON bracket_blaze_entries FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

-- MATCHES POLICIES
CREATE POLICY "Anyone can view matches"
    ON bracket_blaze_matches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions
            WHERE id = bracket_blaze_matches.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = bracket_blaze_matches.division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can insert matches"
    ON bracket_blaze_matches FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can update matches"
    ON bracket_blaze_matches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

-- MATCH EVENTS POLICIES
CREATE POLICY "Anyone can view match events"
    ON bracket_blaze_match_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            WHERE m.id = bracket_blaze_match_events.match_id
            AND d.is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = bracket_blaze_match_events.match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Officials can insert match events"
    ON bracket_blaze_match_events FOR INSERT
    WITH CHECK (bracket_blaze_is_match_official(match_id));

-- OFFICIAL ASSIGNMENTS POLICIES
CREATE POLICY "Anyone can view official assignments"
    ON bracket_blaze_official_assignments FOR SELECT
    USING (true);

CREATE POLICY "Tournament admin can assign officials"
    ON bracket_blaze_official_assignments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can remove officials"
    ON bracket_blaze_official_assignments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

-- CHECKINS POLICIES
CREATE POLICY "Tournament admin can view checkins"
    ON bracket_blaze_checkins FOR SELECT
    USING (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can insert checkins"
    ON bracket_blaze_checkins FOR INSERT
    WITH CHECK (bracket_blaze_is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update checkins"
    ON bracket_blaze_checkins FOR UPDATE
    USING (bracket_blaze_is_tournament_admin(tournament_id));

-- STANDINGS POLICIES
CREATE POLICY "Anyone can view standings"
    ON bracket_blaze_standings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions
            WHERE id = bracket_blaze_standings.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = bracket_blaze_standings.division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "System can manage standings"
    ON bracket_blaze_standings FOR ALL
    USING (true)
    WITH CHECK (true);

-- TEAMS & TEAM MEMBERS POLICIES
CREATE POLICY "Anyone can view teams"
    ON bracket_blaze_teams FOR SELECT USING (true);

CREATE POLICY "Tournament admin can manage teams"
    ON bracket_blaze_teams FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Anyone can view team members"
    ON bracket_blaze_team_members FOR SELECT USING (true);

CREATE POLICY "Tournament admin can manage team members"
    ON bracket_blaze_team_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_teams tm
            JOIN bracket_blaze_divisions d ON d.id = tm.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE tm.id = team_id
            AND t.created_by = auth.uid()
        )
    );

-- DRAWS POLICIES
CREATE POLICY "Anyone can view draws"
    ON bracket_blaze_draws FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions
            WHERE id = bracket_blaze_draws.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = bracket_blaze_draws.division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can manage draws"
    ON bracket_blaze_draws FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bracket_blaze_divisions d
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );
