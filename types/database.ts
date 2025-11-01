export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type TournamentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
export type EntryStatus = 'active' | 'withdrawn' | 'late_add'
export type MatchStatus = 'scheduled' | 'ready' | 'on_court' | 'completed' | 'walkover'
export type SportType = 'badminton' | 'squash' | 'pickleball' | 'padel'
export type FormatType = 'swiss' | 'mexicano' | 'groups_knockout'
export type WinnerSide = 'A' | 'B'

export interface Tournament {
  id: string
  name: string
  venue: string
  timezone: string
  status: TournamentStatus
  rest_window_minutes: number
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
  rules_json: Json
  draw_size: number
  is_published: boolean
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
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  scheduled_at: string | null
  court_id: string | null
  status: MatchStatus
  winner_side: WinnerSide | null
  meta_json: Json
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
  wins: number
  losses: number
  points_for: number
  points_against: number
  tiebreak_json: Json
  updated_at: string
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
