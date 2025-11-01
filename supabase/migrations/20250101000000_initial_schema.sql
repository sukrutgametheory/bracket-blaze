-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE tournament_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');
CREATE TYPE entry_status AS ENUM ('active', 'withdrawn', 'late_add');
CREATE TYPE match_status AS ENUM ('scheduled', 'ready', 'on_court', 'completed', 'walkover');
CREATE TYPE sport_type AS ENUM ('badminton', 'squash', 'pickleball', 'padel');
CREATE TYPE format_type AS ENUM ('swiss', 'mexicano', 'groups_knockout');

-- Tournaments table
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    venue TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    status tournament_status NOT NULL DEFAULT 'draft',
    rest_window_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Courts table
CREATE TABLE courts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'C1', 'C2', etc.
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Divisions table
CREATE TABLE divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    sport sport_type NOT NULL,
    name TEXT NOT NULL, -- e.g., 'Men's Singles', 'Women's Doubles'
    format format_type NOT NULL,
    rules_json JSONB NOT NULL DEFAULT '{}', -- Sport-specific scoring rules
    draw_size INTEGER NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false, -- Control visibility
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participants table (users who register for tournaments)
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    club TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams table (for doubles/group events)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Team members (many-to-many between teams and participants)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, participant_id)
);

-- Entries (participants/teams registered in specific divisions)
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    seed INTEGER,
    status entry_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (participant_id IS NOT NULL AND team_id IS NULL) OR
        (participant_id IS NULL AND team_id IS NOT NULL)
    )
);

-- Draws (bracket/group topology for each division)
CREATE TABLE draws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'swiss', 'mexicano', 'group', 'bracket'
    state_json JSONB NOT NULL DEFAULT '{}', -- Stores draw structure
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    sequence INTEGER NOT NULL, -- Order within the round
    side_a_entry_id UUID REFERENCES entries(id),
    side_b_entry_id UUID REFERENCES entries(id),
    scheduled_at TIMESTAMPTZ,
    court_id UUID REFERENCES courts(id),
    status match_status NOT NULL DEFAULT 'scheduled',
    winner_side TEXT CHECK (winner_side IN ('A', 'B')),
    meta_json JSONB NOT NULL DEFAULT '{}', -- Cached derived state (current score, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Match events (immutable audit log of all scoring actions)
CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL, -- 'point', 'undo', 'game_end', 'set_end', 'match_end', 'walkover'
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Official assignments (refs assigned to matches)
CREATE TABLE official_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL DEFAULT 'referee', -- 'referee', 'umpire', etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, user_id)
);

-- Check-ins (track player presence)
CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    present BOOLEAN NOT NULL DEFAULT false,
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tournament_id, participant_id)
);

-- Standings (materialized view for Swiss/Groups)
CREATE TABLE standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    points_for INTEGER NOT NULL DEFAULT 0,
    points_against INTEGER NOT NULL DEFAULT 0,
    tiebreak_json JSONB NOT NULL DEFAULT '{}', -- Additional tie-break data
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(division_id, entry_id)
);

-- Indexes for performance
CREATE INDEX idx_courts_tournament ON courts(tournament_id);
CREATE INDEX idx_divisions_tournament ON divisions(tournament_id);
CREATE INDEX idx_entries_division ON entries(division_id);
CREATE INDEX idx_matches_division ON matches(division_id);
CREATE INDEX idx_matches_court ON matches(court_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_match_events_match ON match_events(match_id);
CREATE INDEX idx_checkins_tournament ON checkins(tournament_id);
CREATE INDEX idx_standings_division ON standings(division_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_draws_updated_at BEFORE UPDATE ON draws
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_standings_updated_at BEFORE UPDATE ON standings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
