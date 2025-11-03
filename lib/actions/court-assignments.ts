"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"

interface ConflictWarning {
  type: "player_overlap" | "rest_violation"
  severity: "warning" | "error"
  message: string
}

/**
 * Check for conflicts when assigning a match to a court
 */
async function checkConflicts(
  matchId: string,
  courtId: string
): Promise<ConflictWarning[]> {
  const supabase = await createClient()
  const warnings: ConflictWarning[] = []

  // Fetch the match we're trying to assign
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(participant_id),
      side_b:bracket_blaze_entries!side_b_entry_id(participant_id)
    `)
    .eq("id", matchId)
    .single()

  if (!match) return warnings

  const participantIds = [
    match.side_a?.participant_id,
    match.side_b?.participant_id,
  ].filter(Boolean)

  // Check for player overlaps (same player assigned to different court)
  const { data: otherMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      court:bracket_blaze_courts(name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant_id,
        participant:bracket_blaze_participants(display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant_id,
        participant:bracket_blaze_participants(display_name)
      )
    `)
    .neq("id", matchId)
    .not("court_id", "is", null)
    .in("status", ["scheduled", "ready", "on_court"])

  for (const otherMatch of otherMatches || []) {
    const otherParticipantIds = [
      otherMatch.side_a?.participant_id,
      otherMatch.side_b?.participant_id,
    ].filter(Boolean)

    // Check for overlap
    const overlap = participantIds.some(id => otherParticipantIds.includes(id))

    if (overlap) {
      // Find which player
      const conflictingId = participantIds.find(id => otherParticipantIds.includes(id))
      const playerName =
        otherMatch.side_a?.participant_id === conflictingId
          ? otherMatch.side_a?.participant?.display_name
          : otherMatch.side_b?.participant?.display_name

      warnings.push({
        type: "player_overlap",
        severity: "error",
        message: `${playerName} is already assigned to ${otherMatch.court?.name}`,
      })
    }
  }

  // Check for rest period violations (player played recently)
  // Get the tournament's rest window setting
  const { data: division } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select(`
      tournament_id,
      tournament:bracket_blaze_tournaments(rest_window_minutes)
    `)
    .eq("id", match.division_id)
    .single()

  const restWindowMinutes = (division?.tournament as any)?.rest_window_minutes || 15

  // Find recent matches for these participants
  const { data: recentMatches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant_id,
        participant:bracket_blaze_participants(display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant_id,
        participant:bracket_blaze_participants(display_name)
      )
    `)
    .neq("id", matchId)
    .eq("status", "completed")
    .not("actual_end_time", "is", null)

  for (const recentMatch of recentMatches || []) {
    const recentParticipantIds = [
      recentMatch.side_a?.participant_id,
      recentMatch.side_b?.participant_id,
    ].filter(Boolean)

    // Check if any of our players were in this match
    const overlap = participantIds.some(id => recentParticipantIds.includes(id))

    if (overlap && recentMatch.actual_end_time) {
      const endTime = new Date(recentMatch.actual_end_time)
      const now = new Date()
      const minutesSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60)

      if (minutesSinceEnd < restWindowMinutes) {
        const conflictingId = participantIds.find(id =>
          recentParticipantIds.includes(id)
        )
        const playerName =
          recentMatch.side_a?.participant_id === conflictingId
            ? recentMatch.side_a?.participant?.display_name
            : recentMatch.side_b?.participant?.display_name

        const remainingRest = Math.ceil(restWindowMinutes - minutesSinceEnd)

        warnings.push({
          type: "rest_violation",
          severity: "warning",
          message: `${playerName} finished a match ${Math.floor(minutesSinceEnd)} minutes ago (needs ${remainingRest} more minutes rest)`,
        })
      }
    }
  }

  return warnings
}

export async function assignMatchToCourt(
  matchId: string,
  courtId: string,
  userId: string,
  override: boolean = false,
  overrideReason?: string
) {
  try {
    const supabase = await createClient()

    // Check conflicts first
    const warnings = await checkConflicts(matchId, courtId)

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

    // Assign match to court
    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        court_id: courtId,
        status: "ready",
        assigned_at: new Date().toISOString(),
        assigned_by: userId,
      })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    // Log the assignment
    await supabase.from(TABLE_NAMES.COURT_ASSIGNMENTS).insert({
      match_id: matchId,
      court_id: courtId,
      assigned_by: userId,
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
        resolved_by: userId,
        override_reason: overrideReason,
      }))

      await supabase
        .from(TABLE_NAMES.MATCH_CONFLICTS)
        .insert(conflictRecords)
    }

    // Get tournament_id for revalidation
    const { data: match } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("division:bracket_blaze_divisions(tournament_id)")
      .eq("id", matchId)
      .single()

    const tournamentId = (match?.division as any)?.tournament_id

    if (tournamentId) {
      revalidatePath(`/tournaments/${tournamentId}/control-center`)
    }

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
    const supabase = await createClient()

    // Find match on this court
    const { data: match } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, division:bracket_blaze_divisions(tournament_id)")
      .eq("court_id", courtId)
      .single()

    if (!match) {
      return { error: "No match found on this court" }
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

    const tournamentId = (match?.division as any)?.tournament_id

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
