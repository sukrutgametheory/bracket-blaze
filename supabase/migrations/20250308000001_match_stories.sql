-- Match stories for public live portal commentary

CREATE TABLE bracket_blaze_match_stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES bracket_blaze_matches(id) ON DELETE CASCADE,
    story_type TEXT NOT NULL CHECK (story_type IN ('pre_match', 'post_match')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'stale')),
    version INTEGER NOT NULL DEFAULT 1,
    model_slug TEXT,
    prompt_version TEXT NOT NULL DEFAULT 'v1',
    content TEXT,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    generated_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, story_type)
);

CREATE INDEX idx_bracket_blaze_match_stories_match_story_type
ON bracket_blaze_match_stories(match_id, story_type);

CREATE INDEX idx_bracket_blaze_match_stories_status_updated
ON bracket_blaze_match_stories(status, updated_at DESC);

CREATE TRIGGER update_bracket_blaze_match_stories_updated_at
    BEFORE UPDATE ON bracket_blaze_match_stories
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();

ALTER TABLE bracket_blaze_match_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match stories"
    ON bracket_blaze_match_stories FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            WHERE m.id = bracket_blaze_match_stories.match_id
            AND d.is_published = true
        )
        OR
        EXISTS (
            SELECT 1
            FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = bracket_blaze_match_stories.match_id
            AND t.created_by = auth.uid()
        )
    );

CREATE POLICY "Tournament admin can manage match stories"
    ON bracket_blaze_match_stories FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = bracket_blaze_match_stories.match_id
            AND t.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM bracket_blaze_matches m
            JOIN bracket_blaze_divisions d ON d.id = m.division_id
            JOIN bracket_blaze_tournaments t ON t.id = d.tournament_id
            WHERE m.id = bracket_blaze_match_stories.match_id
            AND t.created_by = auth.uid()
        )
    );

COMMENT ON TABLE bracket_blaze_match_stories IS 'Generated spectator-facing commentary for live and completed matches';
COMMENT ON COLUMN bracket_blaze_match_stories.story_type IS 'pre_match for on-court framing, post_match for result recap';
COMMENT ON COLUMN bracket_blaze_match_stories.status IS 'Generation lifecycle status for live portal story rendering';
