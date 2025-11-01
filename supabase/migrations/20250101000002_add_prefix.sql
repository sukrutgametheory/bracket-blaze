-- Migration to add bracket_blaze_ prefix to all tables
-- This should be run INSTEAD of the initial schema if starting fresh
-- OR run this to rename existing tables

-- Drop existing tables if they exist (only if you haven't run migrations yet)
-- Uncomment these lines if you need to start fresh:
-- DROP TABLE IF EXISTS standings CASCADE;
-- DROP TABLE IF EXISTS checkins CASCADE;
-- DROP TABLE IF EXISTS official_assignments CASCADE;
-- DROP TABLE IF EXISTS match_events CASCADE;
-- DROP TABLE IF EXISTS matches CASCADE;
-- DROP TABLE IF EXISTS draws CASCADE;
-- DROP TABLE IF EXISTS entries CASCADE;
-- DROP TABLE IF EXISTS team_members CASCADE;
-- DROP TABLE IF EXISTS teams CASCADE;
-- DROP TABLE IF EXISTS participants CASCADE;
-- DROP TABLE IF EXISTS divisions CASCADE;
-- DROP TABLE IF EXISTS courts CASCADE;
-- DROP TABLE IF EXISTS tournaments CASCADE;
-- DROP TYPE IF EXISTS format_type CASCADE;
-- DROP TYPE IF EXISTS sport_type CASCADE;
-- DROP TYPE IF EXISTS match_status CASCADE;
-- DROP TYPE IF EXISTS entry_status CASCADE;
-- DROP TYPE IF EXISTS tournament_status CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types with prefix
CREATE TYPE bracket_blaze_tournament_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');
CREATE TYPE bracket_blaze_entry_status AS ENUM ('active', 'withdrawn', 'late_add');
CREATE TYPE bracket_blaze_match_status AS ENUM ('scheduled', 'ready', 'on_court', 'completed', 'walkover');
CREATE TYPE bracket_blaze_sport_type AS ENUM ('badminton', 'squash', 'pickleball', 'padel');
CREATE TYPE bracket_blaze_format_type AS ENUM ('swiss', 'mexicano', 'groups_knockout');

-- Tournaments table
CREATE TABLE bracket_blaze_tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    venue TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    status bracket_blaze_tournament_status NOT NULL DEFAULT 'draft',
    rest_window_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Courts table
CREATE TABLE bracket_blaze_courts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES bracket_blaze_tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Divisions table
CREATE TABLE bracket_blaze_divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES bracket_blaze_tournaments(id) ON DELETE CASCADE,
    sport bracket_blaze_sport_type NOT NULL,
    name TEXT NOT NULL,
    format bracket_blaze_format_type NOT NULL,
    rules_json JSONB NOT NULL DEFAULT '{}',
    draw_size INTEGER NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participants table
CREATE TABLE bracket_blaze_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    club TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams table
CREATE TABLE bracket_blaze_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES bracket_blaze_divisions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Team members
CREATE TABLE bracket_blaze_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES bracket_blaze_teams(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES bracket_blaze_participants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, participant_id)
);

-- Entries
CREATE TABLE bracket_blaze_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES bracket_blaze_divisions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES bracket_blaze_participants(id) ON DELETE CASCADE,
    team_id UUID REFERENCES bracket_blaze_teams(id) ON DELETE CASCADE,
    seed INTEGER,
    status bracket_blaze_entry_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (participant_id IS NOT NULL AND team_id IS NULL) OR
        (participant_id IS NULL AND team_id IS NOT NULL)
    )
);

-- Draws
CREATE TABLE bracket_blaze_draws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES bracket_blaze_divisions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    state_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matches table
CREATE TABLE bracket_blaze_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES bracket_blaze_divisions(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    side_a_entry_id UUID REFERENCES bracket_blaze_entries(id),
    side_b_entry_id UUID REFERENCES bracket_blaze_entries(id),
    scheduled_at TIMESTAMPTZ,
    court_id UUID REFERENCES bracket_blaze_courts(id),
    status bracket_blaze_match_status NOT NULL DEFAULT 'scheduled',
    winner_side TEXT CHECK (winner_side IN ('A', 'B')),
    meta_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Match events
CREATE TABLE bracket_blaze_match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES bracket_blaze_matches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Official assignments
CREATE TABLE bracket_blaze_official_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES bracket_blaze_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL DEFAULT 'referee',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, user_id)
);

-- Check-ins
CREATE TABLE bracket_blaze_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES bracket_blaze_tournaments(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES bracket_blaze_participants(id) ON DELETE CASCADE,
    present BOOLEAN NOT NULL DEFAULT false,
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tournament_id, participant_id)
);

-- Standings
CREATE TABLE bracket_blaze_standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES bracket_blaze_divisions(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES bracket_blaze_entries(id) ON DELETE CASCADE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    points_for INTEGER NOT NULL DEFAULT 0,
    points_against INTEGER NOT NULL DEFAULT 0,
    tiebreak_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(division_id, entry_id)
);

-- Indexes for performance
CREATE INDEX idx_bracket_blaze_courts_tournament ON bracket_blaze_courts(tournament_id);
CREATE INDEX idx_bracket_blaze_divisions_tournament ON bracket_blaze_divisions(tournament_id);
CREATE INDEX idx_bracket_blaze_entries_division ON bracket_blaze_entries(division_id);
CREATE INDEX idx_bracket_blaze_matches_division ON bracket_blaze_matches(division_id);
CREATE INDEX idx_bracket_blaze_matches_court ON bracket_blaze_matches(court_id);
CREATE INDEX idx_bracket_blaze_matches_status ON bracket_blaze_matches(status);
CREATE INDEX idx_bracket_blaze_match_events_match ON bracket_blaze_match_events(match_id);
CREATE INDEX idx_bracket_blaze_checkins_tournament ON bracket_blaze_checkins(tournament_id);
CREATE INDEX idx_bracket_blaze_standings_division ON bracket_blaze_standings(division_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION bracket_blaze_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_bracket_blaze_tournaments_updated_at BEFORE UPDATE ON bracket_blaze_tournaments
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();

CREATE TRIGGER update_bracket_blaze_draws_updated_at BEFORE UPDATE ON bracket_blaze_draws
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();

CREATE TRIGGER update_bracket_blaze_matches_updated_at BEFORE UPDATE ON bracket_blaze_matches
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();

CREATE TRIGGER update_bracket_blaze_standings_updated_at BEFORE UPDATE ON bracket_blaze_standings
    FOR EACH ROW EXECUTE FUNCTION bracket_blaze_update_updated_at_column();
