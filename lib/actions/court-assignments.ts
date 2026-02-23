"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import { requireAuth, isTournamentAdminForMatch, requireTournamentAdminForMatch, getTournamentIdForDivision } from "@/lib/auth/require-auth"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

interface ConflictWarning {
  type: "player_overlap" | "rest_violation"
  severity: "warning" | "error"
  message: string
}

/**
 * Check for conflicts when assigning a match to a court.
 * All queries are scoped to the given tournament.
 * Handles both singles (participant_id) and doubles (team_id → team_members).
 *
 * Optimized: uses batch queries and in-memory checks instead of N+1 per-match queries.
 */
async function checkConflicts(
  supabase: ServerSupabase,
  matchId: string,
  tournamentId: string,
  restWindowMinutes: number
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = []

  // 1. Fetch match + all division IDs in parallel (2 queries, parallel)
  const [matchResult, divisionsResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        *,
        side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
        side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
      `)
      .eq("id", matchId)
      .single(),
    supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("id")
      .eq("tournament_id", tournamentId),
  ])

  const match = matchResult.data
  if (!match) return warnings
  const divisionIds = divisionsResult.data?.map((d: { id: string }) => d.id) || []
  if (divisionIds.length === 0) return warnings

  // 2. Fetch active court matches + recent completed matches in parallel (2 queries, parallel)
  const cutoffTime = new Date(Date.now() - restWindowMinutes * 60 * 1000).toISOString()

  const [activeResult, recentResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        *,
        court:bracket_blaze_courts(name),
        side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
        side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
      `)
      .neq("id", matchId)
      .not("court_id", "is", null)
      .in("status", ["scheduled", "ready", "on_court"])
      .in("division_id", divisionIds),
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        *,
        side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
        side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
      `)
      .neq("id", matchId)
      .in("status", ["completed", "walkover"])
      .not("actual_end_time", "is", null)
      .gte("actual_end_time", cutoffTime)
      .in("division_id", divisionIds),
  ])

  // 3. Collect ALL team_ids from all matches, batch-fetch team_members (1 query)
  const allMatches = [match, ...(activeResult.data || []), ...(recentResult.data || [])]
  const allTeamIds = new Set<string>()
  for (const m of allMatches) {
    if (m.side_a?.team_id) allTeamIds.add(m.side_a.team_id)
    if (m.side_b?.team_id) allTeamIds.add(m.side_b.team_id)
  }

  const teamMemberMap = new Map<string, string[]>()
  if (allTeamIds.size > 0) {
    const { data: members } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select("team_id, participant_id")
      .in("team_id", Array.from(allTeamIds))

    for (const member of members || []) {
      const existing = teamMemberMap.get(member.team_id) || []
      existing.push(member.participant_id)
      teamMemberMap.set(member.team_id, existing)
    }
  }

  // Helper: resolve participant IDs from entry using the pre-fetched map (no queries)
  function resolveIds(entry: { participant_id: string | null; team_id: string | null } | null): string[] {
    if (!entry) return []
    if (entry.participant_id) return [entry.participant_id]
    if (entry.team_id) return teamMemberMap.get(entry.team_id) || []
    return []
  }

  const matchParticipantIds = [...resolveIds(match.side_a), ...resolveIds(match.side_b)]
  if (matchParticipantIds.length === 0) return warnings

  // 4. Check player overlaps (in-memory, no queries)
  const conflictParticipantIds = new Set<string>()

  for (const otherMatch of activeResult.data || []) {
    const otherIds = [...resolveIds(otherMatch.side_a), ...resolveIds(otherMatch.side_b)]
    const overlapping = matchParticipantIds.filter(id => otherIds.includes(id))
    for (const id of overlapping) {
      conflictParticipantIds.add(id)
      warnings.push({
        type: "player_overlap",
        severity: "error",
        message: `__PLAYER_${id}__ is already assigned to ${otherMatch.court?.name}`,
      })
    }
  }

  // 5. Check rest violations (in-memory, no queries)
  for (const recentMatch of recentResult.data || []) {
    const recentIds = [...resolveIds(recentMatch.side_a), ...resolveIds(recentMatch.side_b)]
    const overlapping = matchParticipantIds.filter(id => recentIds.includes(id))

    if (overlapping.length > 0 && recentMatch.actual_end_time) {
      const endTime = new Date(recentMatch.actual_end_time)
      const minutesSinceEnd = (Date.now() - endTime.getTime()) / (1000 * 60)

      if (minutesSinceEnd < restWindowMinutes) {
        const remainingRest = Math.ceil(restWindowMinutes - minutesSinceEnd)
        for (const id of overlapping) {
          conflictParticipantIds.add(id)
          warnings.push({
            type: "rest_violation",
            severity: "warning",
            message: `__PLAYER_${id}__ finished a match ${Math.floor(minutesSinceEnd)} minutes ago (needs ${remainingRest} more minutes rest)`,
          })
        }
      }
    }
  }

  // 6. Batch-fetch all conflicting participant names (1 query, only if conflicts found)
  if (conflictParticipantIds.size > 0) {
    const { data: players } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("id, display_name")
      .in("id", Array.from(conflictParticipantIds))

    const nameMap = new Map(players?.map((p: { id: string; display_name: string }) => [p.id, p.display_name]) || [])

    for (const w of warnings) {
      const placeholderMatch = w.message.match(/__PLAYER_(.+?)__/)
      if (placeholderMatch) {
        w.message = w.message.replace(
          `__PLAYER_${placeholderMatch[1]}__`,
          nameMap.get(placeholderMatch[1]) || "A player"
        )
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

    const adminCheck = await requireTournamentAdminForMatch(supabase, matchId, user.id)
    if (!adminCheck.authorized) return { error: "Not authorized for this tournament" }

    const { tournamentId, restWindowMinutes } = adminCheck
    if (!tournamentId) return { error: "Tournament not found" }

    // Check conflicts (scoped to tournament)
    const warnings = await checkConflicts(supabase, matchId, tournamentId, restWindowMinutes!)

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
