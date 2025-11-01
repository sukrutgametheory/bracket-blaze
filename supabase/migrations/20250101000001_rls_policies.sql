-- Enable Row Level Security on all tables
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is tournament director/admin
CREATE OR REPLACE FUNCTION is_tournament_admin(tournament_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM tournaments
        WHERE id = tournament_uuid
        AND created_by = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is assigned as official for a match
CREATE OR REPLACE FUNCTION is_match_official(match_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM official_assignments
        WHERE match_id = match_uuid
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TOURNAMENTS POLICIES
-- Anyone can view published tournaments
CREATE POLICY "Anyone can view tournaments"
    ON tournaments FOR SELECT
    USING (status != 'draft' OR created_by = auth.uid());

-- Only authenticated users can create tournaments
CREATE POLICY "Authenticated users can create tournaments"
    ON tournaments FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Only tournament creator can update/delete
CREATE POLICY "Tournament creator can update"
    ON tournaments FOR UPDATE
    USING (created_by = auth.uid());

CREATE POLICY "Tournament creator can delete"
    ON tournaments FOR DELETE
    USING (created_by = auth.uid());

-- COURTS POLICIES
-- Anyone can view courts of published tournaments
CREATE POLICY "Anyone can view courts"
    ON courts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE id = courts.tournament_id
            AND (status != 'draft' OR created_by = auth.uid())
        )
    );

-- Only tournament admin can manage courts
CREATE POLICY "Tournament admin can insert courts"
    ON courts FOR INSERT
    WITH CHECK (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update courts"
    ON courts FOR UPDATE
    USING (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can delete courts"
    ON courts FOR DELETE
    USING (is_tournament_admin(tournament_id));

-- DIVISIONS POLICIES
-- Anyone can view published divisions
CREATE POLICY "Anyone can view published divisions"
    ON divisions FOR SELECT
    USING (
        is_published = true OR
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE id = divisions.tournament_id
            AND created_by = auth.uid()
        )
    );

-- Only tournament admin can manage divisions
CREATE POLICY "Tournament admin can insert divisions"
    ON divisions FOR INSERT
    WITH CHECK (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update divisions"
    ON divisions FOR UPDATE
    USING (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can delete divisions"
    ON divisions FOR DELETE
    USING (is_tournament_admin(tournament_id));

-- PARTICIPANTS POLICIES
-- Anyone can view participants
CREATE POLICY "Anyone can view participants"
    ON participants FOR SELECT
    USING (true);

-- Authenticated users can create participant profiles
CREATE POLICY "Authenticated users can create participants"
    ON participants FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own participant profile
CREATE POLICY "Users can update own participant profile"
    ON participants FOR UPDATE
    USING (user_id = auth.uid());

-- ENTRIES POLICIES
-- Anyone can view entries for published divisions
CREATE POLICY "Anyone can view entries"
    ON entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM divisions
            WHERE id = entries.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = entries.division_id
            AND t.created_by = auth.uid()
        )
    );

-- Tournament admin can manage entries
CREATE POLICY "Tournament admin can insert entries"
    ON entries FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can update entries"
    ON entries FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can delete entries"
    ON entries FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

-- MATCHES POLICIES
-- Anyone can view matches for published divisions
CREATE POLICY "Anyone can view matches"
    ON matches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM divisions
            WHERE id = matches.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = matches.division_id
            AND t.created_by = auth.uid()
        )
    );

-- Tournament admin can manage matches
CREATE POLICY "Tournament admin can insert matches"
    ON matches FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can update matches"
    ON matches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

-- MATCH EVENTS POLICIES
-- Anyone can view match events for published divisions
CREATE POLICY "Anyone can view match events"
    ON match_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM matches m
            JOIN divisions d ON d.id = m.division_id
            WHERE m.id = match_events.match_id
            AND d.is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM matches m
            JOIN divisions d ON d.id = m.division_id
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_events.match_id
            AND t.created_by = auth.uid()
        )
    );

-- Assigned officials can insert match events
CREATE POLICY "Officials can insert match events"
    ON match_events FOR INSERT
    WITH CHECK (is_match_official(match_id));

-- OFFICIAL ASSIGNMENTS POLICIES
-- Anyone can view official assignments
CREATE POLICY "Anyone can view official assignments"
    ON official_assignments FOR SELECT
    USING (true);

-- Tournament admin can assign officials
CREATE POLICY "Tournament admin can assign officials"
    ON official_assignments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matches m
            JOIN divisions d ON d.id = m.division_id
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can remove officials"
    ON official_assignments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM matches m
            JOIN divisions d ON d.id = m.division_id
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE m.id = match_id
            AND t.created_by = auth.uid()
        )
    );

-- CHECKINS POLICIES
-- Tournament admin can view and manage checkins
CREATE POLICY "Tournament admin can view checkins"
    ON checkins FOR SELECT
    USING (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can insert checkins"
    ON checkins FOR INSERT
    WITH CHECK (is_tournament_admin(tournament_id));

CREATE POLICY "Tournament admin can update checkins"
    ON checkins FOR UPDATE
    USING (is_tournament_admin(tournament_id));

-- STANDINGS POLICIES
-- Anyone can view standings for published divisions
CREATE POLICY "Anyone can view standings"
    ON standings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM divisions
            WHERE id = standings.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = standings.division_id
            AND t.created_by = auth.uid()
        )
    );

-- System can update standings (via functions)
CREATE POLICY "System can manage standings"
    ON standings FOR ALL
    USING (true)
    WITH CHECK (true);

-- TEAMS & TEAM MEMBERS POLICIES (simplified for MVP)
CREATE POLICY "Anyone can view teams"
    ON teams FOR SELECT USING (true);

CREATE POLICY "Tournament admin can manage teams"
    ON teams FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Anyone can view team members"
    ON team_members FOR SELECT USING (true);

CREATE POLICY "Tournament admin can manage team members"
    ON team_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM teams tm
            JOIN divisions d ON d.id = tm.division_id
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE tm.id = team_id
            AND t.created_by = auth.uid()
        )
    );

-- DRAWS POLICIES
CREATE POLICY "Anyone can view draws"
    ON draws FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM divisions
            WHERE id = draws.division_id
            AND is_published = true
        )
        OR
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = draws.division_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can manage draws"
    ON draws FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = division_id
            AND t.created_by = auth.uid()
        )
    );
