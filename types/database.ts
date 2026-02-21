export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type TournamentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
export type EntryStatus = 'active' | 'withdrawn' | 'late_add'
export type MatchStatus = 'scheduled' | 'ready' | 'on_court' | 'pending_signoff' | 'completed' | 'walkover'
export type MatchPhase = 'swiss' | 'knockout'
export type SportType = 'badminton' | 'squash' | 'pickleball' | 'padel'
export type FormatType = 'swiss' | 'mexicano' | 'groups_knockout'
export type PlayMode = 'singles' | 'doubles'
export type WinnerSide = 'A' | 'B'

// Database table names with prefix
export const TABLE_NAMES = {
  TOURNAMENTS: 'bracket_blaze_tournaments',
  COURTS: 'bracket_blaze_courts',
  DIVISIONS: 'bracket_blaze_divisions',
  PARTICIPANTS: 'bracket_blaze_participants',
  TEAMS: 'bracket_blaze_teams',
  TEAM_MEMBERS: 'bracket_blaze_team_members',
  ENTRIES: 'bracket_blaze_entries',
  DRAWS: 'bracket_blaze_draws',
  MATCHES: 'bracket_blaze_matches',
  MATCH_EVENTS: 'bracket_blaze_match_events',
  OFFICIAL_ASSIGNMENTS: 'bracket_blaze_official_assignments',
  CHECKINS: 'bracket_blaze_checkins',
  STANDINGS: 'bracket_blaze_standings',
  MATCH_CONFLICTS: 'bracket_blaze_match_conflicts',
  COURT_ASSIGNMENTS: 'bracket_blaze_court_assignments',
} as const

export interface Tournament {
  id: string
  name: string
  venue: string
  timezone: string
  status: TournamentStatus
  rest_window_minutes: number
  scoring_token: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Court {
  id: string
  tournament_id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Division {
  id: string
  tournament_id: string
  sport: SportType
  name: string
  format: FormatType
  play_mode: PlayMode
  rules_json: Json
  draw_size: number
  is_published: boolean
  scheduling_priority: number
  scheduled_start_time: string | null
  target_completion_time: string | null
  created_at: string
}

export interface Participant {
  id: string
  user_id: string | null
  display_name: string
  club: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export interface Team {
  id: string
  division_id: string
  name: string
  created_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  participant_id: string
  created_at: string
}

export interface Entry {
  id: string
  division_id: string
  participant_id: string | null
  team_id: string | null
  seed: number | null
  status: EntryStatus
  created_at: string
}

export interface Draw {
  id: string
  division_id: string
  type: string
  state_json: Json
  created_at: string
  updated_at: string
}

export interface Match {
  id: string
  division_id: string
  round: number
  sequence: number
  phase: MatchPhase
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  scheduled_at: string | null
  court_id: string | null
  status: MatchStatus
  winner_side: WinnerSide | null
  meta_json: Json
  assigned_at: string | null
  assigned_by: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  estimated_duration_minutes: number
  next_match_id: string | null
  next_match_side: WinnerSide | null
  created_at: string
  updated_at: string
}

export interface MatchEvent {
  id: string
  match_id: string
  timestamp: string
  actor_id: string | null
  event_type: string
  payload_json: Json
  created_at: string
}

export interface OfficialAssignment {
  id: string
  match_id: string
  user_id: string
  role: string
  created_at: string
}

export interface Checkin {
  id: string
  tournament_id: string
  participant_id: string
  present: boolean
  checked_in_at: string | null
  created_at: string
}

export interface Standing {
  id: string
  division_id: string
  entry_id: string
  round: number
  wins: number
  losses: number
  points_for: number
  points_against: number
  tiebreak_json: Json
  updated_at: string
}

export interface MatchConflict {
  id: string
  match_id: string
  conflict_type: string
  severity: string
  details_json: Json
  resolved_at: string | null
  resolved_by: string | null
  override_reason: string | null
  created_at: string
  updated_at: string
}

export interface CourtAssignment {
  id: string
  match_id: string
  court_id: string | null
  assigned_by: string | null
  assigned_at: string
  unassigned_at: string | null
  notes: string | null
}

// Score data stored in match meta_json
export interface GameScore {
  score_a: number
  score_b: number
}

export interface LiveScore {
  current_game: number
  score_a: number
  score_b: number
}

export interface MatchScoreData {
  games: GameScore[]
  total_points_a: number
  total_points_b: number
  walkover?: boolean
  bye?: boolean
  live_score?: LiveScore
}

// Extended types with relations
export interface MatchWithDetails extends Match {
  court?: Court
  side_a_entry?: Entry & {
    participant?: Participant
    team?: Team
  }
  side_b_entry?: Entry & {
    participant?: Participant
    team?: Team
  }
}

export interface DivisionWithTournament extends Division {
  tournament?: Tournament
}

export interface EntryWithParticipant extends Entry {
  participant?: Participant
  team?: Team & {
    members?: (TeamMember & { participant?: Participant })[]
  }
}

export interface StandingWithEntry extends Standing {
  entry?: EntryWithParticipant
}
