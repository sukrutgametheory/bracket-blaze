-- Create the global player registry table
-- Players are uniquely identified by phone number (E.164 format)
-- This table is global (not tournament-scoped) and shared across all TDs

CREATE TABLE bracket_blaze_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    club TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phone is the canonical unique identity
CREATE UNIQUE INDEX idx_bracket_blaze_players_phone
ON bracket_blaze_players(phone);

-- Index for name-based lookups (future use)
CREATE INDEX idx_bracket_blaze_players_name
ON bracket_blaze_players(LOWER(display_name));

-- Apply updated_at trigger (function already exists from initial migration)
CREATE TRIGGER update_bracket_blaze_players_updated_at
    BEFORE UPDATE ON bracket_blaze_players
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();

-- Enable RLS
ALTER TABLE bracket_blaze_players ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users only (phone numbers are PII)
CREATE POLICY "Authenticated users can view players"
    ON bracket_blaze_players FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create players"
    ON bracket_blaze_players FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update players"
    ON bracket_blaze_players FOR UPDATE
    USING (auth.role() = 'authenticated');

-- No DELETE policy — global players are never deleted
