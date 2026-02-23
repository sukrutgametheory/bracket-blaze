import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import type { User } from "@supabase/supabase-js"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

interface AuthResult {
  supabase: ServerSupabase
  user: User
}

/**
 * Require authentication for a server action.
 * Returns the Supabase client and authenticated user, or null if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  return { supabase, user }
}

/**
 * Check if the authenticated user is the tournament admin (creator)
 * for a given division.
 */
export async function isTournamentAdminForDivision(
  supabase: ServerSupabase,
  divisionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", divisionId)
    .single()

  if (!data?.tournament_id) return false

  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("created_by")
    .eq("id", data.tournament_id)
    .single()

  return tournament?.created_by === userId
}

/**
 * Check if the authenticated user is the tournament admin (creator)
 * for a given match (via match → division → tournament).
 */
export async function isTournamentAdminForMatch(
  supabase: ServerSupabase,
  matchId: string,
  userId: string
): Promise<boolean> {
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("division_id")
    .eq("id", matchId)
    .single()

  if (!match?.division_id) return false

  return isTournamentAdminForDivision(supabase, match.division_id, userId)
}

/**
 * Check if the authenticated user is the tournament admin for a given match,
 * and return context (divisionId, tournamentId, restWindowMinutes) to avoid
 * redundant queries in the caller.
 */
export async function requireTournamentAdminForMatch(
  supabase: ServerSupabase,
  matchId: string,
  userId: string
): Promise<{ authorized: boolean; divisionId?: string; tournamentId?: string; restWindowMinutes?: number }> {
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("division_id")
    .eq("id", matchId)
    .single()

  if (!match?.division_id) return { authorized: false }

  const { data: division } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", match.division_id)
    .single()

  if (!division?.tournament_id) return { authorized: false }

  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("created_by, rest_window_minutes")
    .eq("id", division.tournament_id)
    .single()

  return {
    authorized: tournament?.created_by === userId,
    divisionId: match.division_id,
    tournamentId: division.tournament_id,
    restWindowMinutes: tournament?.rest_window_minutes ?? 15,
  }
}

/**
 * Get the tournament_id for a given division.
 */
export async function getTournamentIdForDivision(
  supabase: ServerSupabase,
  divisionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", divisionId)
    .single()

  return data?.tournament_id ?? null
}
