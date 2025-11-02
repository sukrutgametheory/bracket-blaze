-- Add tournament_id to participants table
-- Participants should be scoped to tournaments, not global

ALTER TABLE bracket_blaze_participants
ADD COLUMN tournament_id UUID NOT NULL REFERENCES bracket_blaze_tournaments(id) ON DELETE CASCADE;

-- Add index for efficient lookups
CREATE INDEX idx_bracket_blaze_participants_tournament
ON bracket_blaze_participants(tournament_id);

-- Add index for participant name searches within tournament
CREATE INDEX idx_bracket_blaze_participants_name
ON bracket_blaze_participants(tournament_id, display_name);

-- Add unique constraint: same display name can't be registered twice in same tournament
CREATE UNIQUE INDEX idx_bracket_blaze_participants_unique_name
ON bracket_blaze_participants(tournament_id, LOWER(display_name));
