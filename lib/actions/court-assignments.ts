"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import {
  requireAuth,
  isTournamentAdminForMatch,
  requireTournamentAdminForCourt,
  requireTournamentAdminForMatch,
  getTournamentIdForDivision,
} from "@/lib/auth/require-auth"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

type AssignmentKind = "active" | "queue"

const ACTIVE_MATCH_STATUSES = ["scheduled", "ready", "on_court", "pending_signoff"] as const
const OCCUPIED_COURT_STATUSES = ["ready", "on_court", "pending_signoff"] as const

interface ConflictWarning {
  type: "player_overlap" | "rest_violation"
  severity: "warning" | "error"
  message: string
}

export interface PromotionResult {
  status: "promoted" | "none" | "returned_to_ready"
  message?: string
}

function normalizeAssignmentError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  if (message.includes("idx_bracket_blaze_matches_one_active_per_court")) {
    return "Court already has an active match"
  }
  if (message.includes("idx_bracket_blaze_matches_one_queue_per_court")) {
    return "Court already has a queued match"
  }
  return message
}

function normalizeQueueSchemaError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  if (message.includes("queued_court_id") || message.includes("queued_at") || message.includes("queued_by") || message.includes("assignment_kind")) {
    return "Court queue feature requires the latest database migration. Run supabase/migrations/20250307000001_court_queue_slot.sql."
  }
  return message
}

export async function closeOpenAssignmentAuditRows(
  supabase: ServerSupabase,
  matchIds: string[],
  assignmentKind: AssignmentKind
) {
  if (matchIds.length === 0) return

  await supabase
    .from(TABLE_NAMES.COURT_ASSIGNMENTS)
    .update({ unassigned_at: new Date().toISOString() })
    .in("match_id", matchIds)
    .eq("assignment_kind", assignmentKind)
    .is("unassigned_at", null)
}

async function logResolvedConflicts(
  supabase: ServerSupabase,
  matchId: string,
  warnings: ConflictWarning[],
  userId: string,
  reason: string
) {
  if (warnings.length === 0) return

  const conflictRecords = warnings.map(w => ({
    match_id: matchId,
    conflict_type: w.type,
    severity: w.severity,
    details_json: { message: w.message },
    resolved_at: new Date().toISOString(),
    resolved_by: userId,
    override_reason: reason,
  }))

  await supabase
    .from(TABLE_NAMES.MATCH_CONFLICTS)
    .insert(conflictRecords)
}

async function clearQueuedReservationsForCourt(
  supabase: ServerSupabase,
  courtId: string
): Promise<number> {
  const { data: queuedMatches, error: queuedFetchError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("id")
    .eq("queued_court_id", courtId)

  if (queuedFetchError || !queuedMatches || queuedMatches.length === 0) {
    return 0
  }

  const queuedMatchIds = queuedMatches.map(match => match.id)

  await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      queued_court_id: null,
      queued_at: null,
      queued_by: null,
    })
    .eq("queued_court_id", courtId)

  await closeOpenAssignmentAuditRows(supabase, queuedMatchIds, "queue")

  return queuedMatchIds.length
}

async function clearQueuedReservationForMatch(
  supabase: ServerSupabase,
  matchId: string
) {
  await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      queued_court_id: null,
      queued_at: null,
      queued_by: null,
    })
    .eq("id", matchId)

  await closeOpenAssignmentAuditRows(supabase, [matchId], "queue")
}

async function getCourtSlotState(supabase: ServerSupabase, courtId: string) {
  const [activeResult, occupiedResult, queuedResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status")
      .eq("court_id", courtId)
      .in("status", [...ACTIVE_MATCH_STATUSES]),
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status")
      .eq("court_id", courtId)
      .in("status", [...OCCUPIED_COURT_STATUSES]),
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status")
      .eq("queued_court_id", courtId),
  ])

  return {
    activeMatch: activeResult.data?.[0] ?? null,
    occupiedMatch: occupiedResult.data?.[0] ?? null,
    queuedMatch: queuedResult.data?.[0] ?? null,
  }
}

async function revalidateControlCenter(tournamentId?: string) {
  if (!tournamentId) return
  revalidatePath(`/tournaments/${tournamentId}/control-center`)
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

  const cutoffTime = new Date(Date.now() - restWindowMinutes * 60 * 1000).toISOString()

  const [activeResult, recentResult] = await Promise.all([
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        *,
        court:bracket_blaze_courts!bracket_blaze_matches_court_id_fkey(name),
        side_a:bracket_blaze_entries!side_a_entry_id(participant_id, team_id),
        side_b:bracket_blaze_entries!side_b_entry_id(participant_id, team_id)
      `)
      .neq("id", matchId)
      .not("court_id", "is", null)
      .in("status", [...ACTIVE_MATCH_STATUSES])
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

  const allMatches = [match, ...(activeResult.data || []), ...(recentResult.data || [])]
  const allTeamIds = new Set<string>()
  for (const currentMatch of allMatches) {
    if (currentMatch.side_a?.team_id) allTeamIds.add(currentMatch.side_a.team_id)
    if (currentMatch.side_b?.team_id) allTeamIds.add(currentMatch.side_b.team_id)
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

  function resolveIds(entry: { participant_id: string | null; team_id: string | null } | null): string[] {
    if (!entry) return []
    if (entry.participant_id) return [entry.participant_id]
    if (entry.team_id) return teamMemberMap.get(entry.team_id) || []
    return []
  }

  const matchParticipantIds = [...resolveIds(match.side_a), ...resolveIds(match.side_b)]
  if (matchParticipantIds.length === 0) return warnings

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

  if (conflictParticipantIds.size > 0) {
    const { data: players } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("id, display_name")
      .in("id", Array.from(conflictParticipantIds))

    const nameMap = new Map(players?.map((p: { id: string; display_name: string }) => [p.id, p.display_name]) || [])

    for (const warning of warnings) {
      const placeholderMatch = warning.message.match(/__PLAYER_(.+?)__/)
      if (placeholderMatch) {
        warning.message = warning.message.replace(
          `__PLAYER_${placeholderMatch[1]}__`,
          nameMap.get(placeholderMatch[1]) || "A player"
        )
      }
    }
  }

  return warnings
}

export async function promoteQueuedMatchForCourt(
  supabase: ServerSupabase,
  courtId: string,
  actingUserId: string,
  tournamentId: string,
  restWindowMinutes: number
): Promise<PromotionResult> {
  const { data: queuedMatch, error: queuedFetchError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("id, status, court_id, queued_court_id")
    .eq("queued_court_id", courtId)
    .maybeSingle()

  if (queuedFetchError || !queuedMatch) {
    return { status: "none" }
  }

  const warnings = await checkConflicts(supabase, queuedMatch.id, tournamentId, restWindowMinutes)
  const blockingErrors = warnings.filter(warning => warning.severity === "error")

  if (blockingErrors.length > 0) {
    await clearQueuedReservationForMatch(supabase, queuedMatch.id)
    return {
      status: "returned_to_ready",
      message: `Queued match returned to ready queue: ${blockingErrors.map(error => error.message).join("; ")}`,
    }
  }

  const now = new Date().toISOString()
  const { data: promotedMatch, error: promoteError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      court_id: courtId,
      queued_court_id: null,
      queued_at: null,
      queued_by: null,
      status: "ready",
      assigned_at: now,
      assigned_by: actingUserId,
    })
    .eq("id", queuedMatch.id)
    .is("court_id", null)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle()

  if (promoteError) {
    await clearQueuedReservationForMatch(supabase, queuedMatch.id)
    return {
      status: "returned_to_ready",
      message: `Queued match returned to ready queue: ${normalizeAssignmentError(promoteError.message, "Promotion failed")}`,
    }
  }

  if (!promotedMatch) {
    await clearQueuedReservationForMatch(supabase, queuedMatch.id)
    return {
      status: "returned_to_ready",
      message: "Queued match returned to ready queue because it was no longer promotable",
    }
  }

  await closeOpenAssignmentAuditRows(supabase, [queuedMatch.id], "queue")
  await supabase.from(TABLE_NAMES.COURT_ASSIGNMENTS).insert({
    match_id: queuedMatch.id,
    court_id: courtId,
    assignment_kind: "active",
    assigned_by: actingUserId,
  })

  const warningMessages = warnings.filter(warning => warning.severity === "warning")
  if (warningMessages.length > 0) {
    await logResolvedConflicts(supabase, queuedMatch.id, warningMessages, actingUserId, "Auto-promoted from court queue")
  }

  return {
    status: "promoted",
    message: warningMessages.length > 0
      ? `Queued match promoted to court with warnings: ${warningMessages.map(warning => warning.message).join("; ")}`
      : "Queued match promoted to court",
  }
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

    const courtState = await getCourtSlotState(supabase, courtId)
    if (courtState.activeMatch) {
      return { error: "Court already has an active match" }
    }
    if (courtState.queuedMatch) {
      return { error: "Court already has a queued match reserved" }
    }

    const warnings = await checkConflicts(supabase, matchId, tournamentId, restWindowMinutes!)

    const errors = warnings.filter(warning => warning.severity === "error")
    if (errors.length > 0 && !override) {
      return {
        error: errors.map(error => error.message).join("; "),
        warnings: warnings.map(warning => warning.message),
      }
    }

    const warningMessages = warnings.filter(warning => warning.severity === "warning")
    if (warningMessages.length > 0 && !override) {
      return {
        warnings: warningMessages.map(warning => warning.message),
      }
    }

    const now = new Date().toISOString()
    const { data: assignedMatch, error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        court_id: courtId,
        status: "ready",
        assigned_at: now,
        assigned_by: user.id,
      })
      .eq("id", matchId)
      .eq("status", "scheduled")
      .is("court_id", null)
      .is("queued_court_id", null)
      .select("id")
      .maybeSingle()

    if (updateError) {
      return { error: normalizeAssignmentError(updateError.message, "Failed to assign match to court") }
    }

    if (!assignedMatch) {
      return { error: "Match is no longer available for direct assignment" }
    }

    await supabase.from(TABLE_NAMES.COURT_ASSIGNMENTS).insert({
      match_id: matchId,
      court_id: courtId,
      assignment_kind: "active",
      assigned_by: user.id,
      notes: override ? overrideReason : null,
    })

    if (override && warnings.length > 0) {
      await logResolvedConflicts(supabase, matchId, warnings, user.id, overrideReason || "TD override")
    }

    await revalidateControlCenter(tournamentId)

    return {
      success: true,
      message: "Match assigned to court",
    }
  } catch (error) {
    console.error("Error in assignMatchToCourt:", error)
    return { error: "Failed to assign match to court" }
  }
}

export async function queueMatchForCourt(matchId: string, courtId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const [matchAdmin, courtAdmin] = await Promise.all([
      requireTournamentAdminForMatch(supabase, matchId, user.id),
      requireTournamentAdminForCourt(supabase, courtId, user.id),
    ])

    if (!matchAdmin.authorized || !courtAdmin.authorized) {
      return { error: "Not authorized for this tournament" }
    }

    if (!matchAdmin.tournamentId || matchAdmin.tournamentId !== courtAdmin.tournamentId) {
      return { error: "Match and court must belong to the same tournament" }
    }

    const [matchResult, courtState] = await Promise.all([
      supabase
        .from(TABLE_NAMES.MATCHES)
        .select("id, status, court_id, queued_court_id, side_b_entry_id")
        .eq("id", matchId)
        .single(),
      getCourtSlotState(supabase, courtId),
    ])

    const match = matchResult.data
    if (matchResult.error || !match) {
      return {
        error: matchResult.error
          ? normalizeQueueSchemaError(matchResult.error.message, "Failed to load match for queueing")
          : "Match not found",
      }
    }

    if (match.status !== "scheduled") {
      return { error: `Only scheduled matches can be queued. Current status is '${match.status}'` }
    }

    if (match.court_id) {
      return { error: "Match is already assigned to a court" }
    }

    if (match.queued_court_id) {
      return { error: "Match is already queued for another court" }
    }

    if (!match.side_b_entry_id) {
      return { error: "Bye matches cannot be queued" }
    }

    if (!courtState.occupiedMatch) {
      return { error: "Only occupied courts can accept a queued match" }
    }

    if (courtState.queuedMatch) {
      return { error: "Court already has a queued match" }
    }

    const now = new Date().toISOString()
    const { data: queuedMatch, error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        queued_court_id: courtId,
        queued_at: now,
        queued_by: user.id,
      })
      .eq("id", matchId)
      .eq("status", "scheduled")
      .is("court_id", null)
      .is("queued_court_id", null)
      .select("id")
      .maybeSingle()

    if (updateError) {
      return { error: normalizeAssignmentError(updateError.message, "Failed to queue match for court") }
    }

    if (!queuedMatch) {
      return { error: "Match is no longer available for queueing" }
    }

    await supabase.from(TABLE_NAMES.COURT_ASSIGNMENTS).insert({
      match_id: matchId,
      court_id: courtId,
      assignment_kind: "queue",
      assigned_by: user.id,
    })

    await revalidateControlCenter(matchAdmin.tournamentId)

    return {
      success: true,
      message: "Match queued for court",
    }
  } catch (error) {
    console.error("Error in queueMatchForCourt:", error)
    return { error: "Failed to queue match for court" }
  }
}

export async function clearCourtQueue(courtId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const adminCheck = await requireTournamentAdminForCourt(supabase, courtId, user.id)
    if (!adminCheck.authorized) return { error: "Not authorized for this tournament" }

    const clearedCount = await clearQueuedReservationsForCourt(supabase, courtId)
    if (clearedCount === 0) {
      return { error: "No queued match found for this court" }
    }

    await revalidateControlCenter(adminCheck.tournamentId)

    return {
      success: true,
      message: "Queued match cleared",
    }
  } catch (error) {
    console.error("Error in clearCourtQueue:", error)
    return { error: "Failed to clear queued match" }
  }
}

export async function clearCourt(courtId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const { data: match } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id")
      .eq("court_id", courtId)
      .in("status", [...ACTIVE_MATCH_STATUSES])
      .single()

    if (!match) {
      return { error: "No match found on this court" }
    }

    const isAdmin = await isTournamentAdminForMatch(supabase, match.id, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    if (match.status === "on_court") {
      return { error: "Cannot clear court: match is in progress. Complete or walkover the match first." }
    }

    if (match.status === "pending_signoff") {
      return { error: "Cannot clear court: match is pending sign-off. Approve or reject the match first." }
    }

    const { data: clearedMatch, error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        court_id: null,
        status: "scheduled",
        assigned_at: null,
        assigned_by: null,
      })
      .eq("id", match.id)
      .select("id")
      .maybeSingle()

    if (updateError) {
      return { error: updateError.message }
    }

    if (!clearedMatch) {
      return { error: "Court could not be cleared" }
    }

    await closeOpenAssignmentAuditRows(supabase, [match.id], "active")

    const clearedQueuedCount = await clearQueuedReservationsForCourt(supabase, courtId)

    const tournamentId = await getTournamentIdForDivision(supabase, match.division_id)
    await revalidateControlCenter(tournamentId ?? undefined)

    return {
      success: true,
      message: clearedQueuedCount > 0 ? "Court cleared and queued match removed" : "Court cleared",
    }
  } catch (error) {
    console.error("Error in clearCourt:", error)
    return { error: "Failed to clear court" }
  }
}
