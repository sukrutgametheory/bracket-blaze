-- Add player_id FK to participants, linking tournament participants to global players
-- Nullable initially to support gradual backfill of existing data

ALTER TABLE bracket_blaze_participants
ADD COLUMN player_id UUID REFERENCES bracket_blaze_players(id);

-- Index for efficient lookups by player_id (used for player history queries)
CREATE INDEX idx_bracket_blaze_participants_player
ON bracket_blaze_participants(player_id);

-- Prevent the same global player from being added twice to the same tournament
-- Partial index: only enforced when player_id is set (allows NULLs during backfill)
CREATE UNIQUE INDEX idx_bracket_blaze_participants_tournament_player
ON bracket_blaze_participants(tournament_id, player_id)
WHERE player_id IS NOT NULL;

-- Atomic find-or-create function for global players
-- Handles concurrent creation via ON CONFLICT and implements last-write-wins
CREATE OR REPLACE FUNCTION bracket_blaze_find_or_create_player(
    p_phone TEXT,
    p_display_name TEXT,
    p_email TEXT DEFAULT NULL,
    p_club TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_id UUID;
BEGIN
    INSERT INTO bracket_blaze_players (phone, display_name, email, club)
    VALUES (p_phone, p_display_name, p_email, p_club)
    ON CONFLICT (phone) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        club = EXCLUDED.club,
        updated_at = NOW()
    RETURNING id INTO v_player_id;

    RETURN v_player_id;
END;
$$;
