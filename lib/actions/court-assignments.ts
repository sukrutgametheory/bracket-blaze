"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import { requireAuth, isTournamentAdminForMatch, getTournamentIdForDivision } from "@/lib/auth/require-auth"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

interface ConflictWarning {
  type: "player_overlap" | "rest_violation"
  severity: "warning" | "error"
  message: string
}

/**
 * Resolve all participant IDs for a match entry (handles both singles and doubles).
 * For singles: returns [participant_id]
 * For doubles: queries team_members to get participant_ids
 */
async function resolveEntryParticipantIds(
  supabase: ServerSupabase,
  entry: { participant_id: string | null; team_id: string | null } | null
): Promise<string[]> {
  if (!entry) return []
  if (entry.participant_id) return [entry.participant_id]
  if (entry.team_id) {
    const { data: members } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select("participant_id")
      .eq("team_id", entry.team_id)
    return members?.map(m => m.participant_id) || []
  }
  return []
}

/**
 * Check for conflicts when assigning a match to a court.
 * All queries are scoped to the given tournament.
 * Handles both singles (participant_id) and doubles (team_id → team_members).
 */
async function checkConflicts(
  supabase: ServerSupabase,
  matchId: string,
  tournamentId: string
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = []

  // Fetch the match we're trying to assign
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
    `)
    .eq("id", matchId)
    .single()

  if (!match) return warnings

  // Resolve all participant IDs (works for both singles and doubles)
  const sideAIds = await resolveEntryParticipantIds(supabase, match.side_a)
  const sideBIds = await resolveEntryParticipantIds(supabase, match.side_b)
  const participantIds = [...sideAIds, ...sideBIds]

  if (participantIds.length === 0) return warnings

  // Get all division IDs for this tournament (scope queries)
  const { data: tournamentDivisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id")
    .eq("tournament_id", tournamentId)

  const divisionIds = tournamentDivisions?.map(d => d.id) || []
  if (divisionIds.length === 0) return warnings

  // Check for player overlaps — only matches in this tournament
  const { data: otherMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      court:bracket_blaze_courts(name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant_id, team_id,
        participant:bracket_blaze_participants(display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant_id, team_id,
        participant:bracket_blaze_participants(display_name)
      )
    `)
    .neq("id", matchId)
    .not("court_id", "is", null)
    .in("status", ["scheduled", "ready", "on_court"])
    .in("division_id", divisionIds)

  for (const otherMatch of otherMatches || []) {
    const otherSideAIds = await resolveEntryParticipantIds(supabase, otherMatch.side_a)
    const otherSideBIds = await resolveEntryParticipantIds(supabase, otherMatch.side_b)
    const otherParticipantIds = [...otherSideAIds, ...otherSideBIds]

    const overlap = participantIds.some(id => otherParticipantIds.includes(id))

    if (overlap) {
      const conflictingId = participantIds.find(id => otherParticipantIds.includes(id))
      // Look up the conflicting player's name
      const { data: conflictPlayer } = await supabase
        .from(TABLE_NAMES.PARTICIPANTS)
        .select("display_name")
        .eq("id", conflictingId!)
        .single()

      warnings.push({
        type: "player_overlap",
        severity: "error",
        message: `${conflictPlayer?.display_name || "A player"} is already assigned to ${otherMatch.court?.name}`,
      })
    }
  }

  // Check for rest period violations — only matches in this tournament
  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("rest_window_minutes")
    .eq("id", tournamentId)
    .single()

  const restWindowMinutes = tournament?.rest_window_minutes || 15

  const { data: recentMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
    `)
    .neq("id", matchId)
    .eq("status", "completed")
    .not("actual_end_time", "is", null)
    .in("division_id", divisionIds)

  for (const recentMatch of recentMatches || []) {
    const recentSideAIds = await resolveEntryParticipantIds(supabase, recentMatch.side_a)
    const recentSideBIds = await resolveEntryParticipantIds(supabase, recentMatch.side_b)
    const recentParticipantIds = [...recentSideAIds, ...recentSideBIds]

    const overlap = participantIds.some(id => recentParticipantIds.includes(id))

    if (overlap && recentMatch.actual_end_time) {
      const endTime = new Date(recentMatch.actual_end_time)
      const now = new Date()
      const minutesSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60)

      if (minutesSinceEnd < restWindowMinutes) {
        const conflictingId = participantIds.find(id =>
          recentParticipantIds.includes(id)
        )
        const { data: conflictPlayer } = await supabase
          .from(TABLE_NAMES.PARTICIPANTS)
          .select("display_name")
          .eq("id", conflictingId!)
          .single()

        const remainingRest = Math.ceil(restWindowMinutes - minutesSinceEnd)

        warnings.push({
          type: "rest_violation",
          severity: "warning",
          message: `${conflictPlayer?.display_name || "A player"} finished a match ${Math.floor(minutesSinceEnd)} minutes ago (needs ${remainingRest} more minutes rest)`,
        })
      }
    }
  }

  return warnings
}

export async function assignMatchToCourt(
  matchId: string,
  courtId: string,
  override: boolean = false,
  overrideReason?: string
) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Get tournament ID for scoped conflict checks
    const { data: matchDiv } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("division_id")
      .eq("id", matchId)
      .single()

    if (!matchDiv) return { error: "Match not found" }

    const tournamentId = await getTournamentIdForDivision(supabase, matchDiv.division_id)
    if (!tournamentId) return { error: "Tournament not found" }

    // Check conflicts (scoped to tournament)
    const warnings = await checkConflicts(supabase, matchId, tournamentId)

    // Block if there are errors (not just warnings)
    const errors = warnings.filter(w => w.severity === "error")
    if (errors.length > 0 && !override) {
      return {
        error: errors.map(e => e.message).join("; "),
        warnings: warnings.map(w => w.message),
      }
    }

    // Allow warnings to be overridden
    const warningMessages = warnings.filter(w => w.severity === "warning")
    if (warningMessages.length > 0 && !override) {
      return {
        warnings: warningMessages.map(w => w.message),
      }
    }

    // Assign match to court — userId from session, not client
    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        court_id: courtId,
        status: "ready",
        assigned_at: new Date().toISOString(),
        assigned_by: user.id,
      })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    // Log the assignment
    await supabase.from(TABLE_NAMES.COURT_ASSIGNMENTS).insert({
      match_id: matchId,
      court_id: courtId,
      assigned_by: user.id,
      notes: override ? overrideReason : null,
    })

    // Log conflicts if any were overridden
    if (override && warnings.length > 0) {
      const conflictRecords = warnings.map(w => ({
        match_id: matchId,
        conflict_type: w.type,
        severity: w.severity,
        details_json: { message: w.message },
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        override_reason: overrideReason,
      }))

      await supabase
        .from(TABLE_NAMES.MATCH_CONFLICTS)
        .insert(conflictRecords)
    }

    revalidatePath(`/tournaments/${tournamentId}/control-center`)

    return {
      success: true,
      message: "Match assigned to court",
    }
  } catch (error) {
    console.error("Error in assignMatchToCourt:", error)
    return { error: "Failed to assign match to court" }
  }
}

export async function clearCourt(courtId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    // Find active match on this court (exclude completed/walkover)
    const { data: match } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id")
      .eq("court_id", courtId)
      .in("status", ["scheduled", "ready", "on_court", "pending_signoff"])
      .single()

    if (!match) {
      return { error: "No match found on this court" }
    }

    // Verify tournament admin via match's division
    const isAdmin = await isTournamentAdminForMatch(supabase, match.id, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Guard: cannot clear completed or walkover matches
    if (match.status === "completed" || match.status === "walkover") {
      return { error: `Cannot clear court: match is already ${match.status}` }
    }

    // Guard: cannot clear in-progress matches without explicit action
    if (match.status === "on_court") {
      return { error: "Cannot clear court: match is in progress. Complete or walkover the match first." }
    }

    // Guard: cannot clear matches pending TD sign-off
    if (match.status === "pending_signoff") {
      return { error: "Cannot clear court: match is pending sign-off. Approve or reject the match first." }
    }

    // Clear court assignment
    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        court_id: null,
        status: "scheduled",
        assigned_at: null,
        assigned_by: null,
      })
      .eq("id", match.id)

    if (updateError) {
      return { error: updateError.message }
    }

    // Log unassignment
    await supabase
      .from(TABLE_NAMES.COURT_ASSIGNMENTS)
      .update({ unassigned_at: new Date().toISOString() })
      .eq("match_id", match.id)
      .is("unassigned_at", null)

    const tournamentId = await getTournamentIdForDivision(supabase, match.division_id)
    if (tournamentId) {
      revalidatePath(`/tournaments/${tournamentId}/control-center`)
    }

    return {
      success: true,
      message: "Court cleared",
    }
  } catch (error) {
    console.error("Error in clearCourt:", error)
    return { error: "Failed to clear court" }
  }
}
