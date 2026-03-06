import { isRoundComplete } from "@/lib/services/draw-generators/swiss-engine"
import type { EntryStatus } from "@/types/database"

export const COMPETITION_ACTIVE_ENTRY_STATUSES: EntryStatus[] = ["active", "late_add"]
export const REPAIR_LATE_ADD_ELIGIBLE_FROM_ROUND = 2
export const REPAIR_LATE_ADD_INITIAL_WINS = 0
export const REPAIR_LATE_ADD_INITIAL_LOSSES = 1

export interface SwissRepairLateAddState {
  eligible_from_round: number
  initial_wins: number
  initial_losses: number
  pairing_sort_bucket?: "bottom_of_zero_win"
}

export interface SwissRepairState {
  excluded_match_ids?: string[]
  late_adds?: Record<string, SwissRepairLateAddState>
}

export interface SwissRepairWindowMatch {
  round: number
  status: string
  phase: string
}

export interface SwissRepairWindowStatus {
  available: boolean
  reason?: string
  draw_exists: boolean
  round1_complete: boolean
  round2_generated: boolean
  knockout_phase: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isCompetitionActiveEntryStatus(
  status: string | null | undefined
): status is "active" | "late_add" {
  return status === "active" || status === "late_add"
}

export function getCompetitionActiveEntryCount(
  entries: Array<{ status: string | null | undefined }>
): number {
  return entries.filter((entry) => isCompetitionActiveEntryStatus(entry.status)).length
}

export function createLateAddRepairState(): SwissRepairLateAddState {
  return {
    eligible_from_round: REPAIR_LATE_ADD_ELIGIBLE_FROM_ROUND,
    initial_wins: REPAIR_LATE_ADD_INITIAL_WINS,
    initial_losses: REPAIR_LATE_ADD_INITIAL_LOSSES,
    pairing_sort_bucket: "bottom_of_zero_win",
  }
}

export function getSwissRepairState(drawState: unknown): SwissRepairState {
  if (!isPlainObject(drawState) || !isPlainObject(drawState.swiss_repair)) {
    return { excluded_match_ids: [], late_adds: {} }
  }

  const swissRepair = drawState.swiss_repair as Record<string, unknown>
  const excludedMatchIds = Array.isArray(swissRepair.excluded_match_ids)
    ? swissRepair.excluded_match_ids.filter((id): id is string => typeof id === "string")
    : []
  const lateAdds = isPlainObject(swissRepair.late_adds)
    ? Object.fromEntries(
        Object.entries(swissRepair.late_adds).filter(([, value]) => isPlainObject(value))
      ) as Record<string, SwissRepairLateAddState>
    : {}

  return {
    excluded_match_ids: excludedMatchIds,
    late_adds: lateAdds,
  }
}

export function getExcludedMatchIds(drawState: unknown): string[] {
  return getSwissRepairState(drawState).excluded_match_ids || []
}

export function getLateAddRepairState(
  drawState: unknown,
  entryId: string
): SwissRepairLateAddState | undefined {
  return getSwissRepairState(drawState).late_adds?.[entryId]
}

export function withExcludedMatchIds(drawState: unknown, matchIds: string[]) {
  const base = isPlainObject(drawState) ? drawState : {}
  const swissRepair = getSwissRepairState(drawState)
  const excludedMatchIds = new Set(swissRepair.excluded_match_ids || [])

  for (const matchId of matchIds) {
    if (matchId) excludedMatchIds.add(matchId)
  }

  return {
    ...base,
    swiss_repair: {
      ...swissRepair,
      excluded_match_ids: Array.from(excludedMatchIds),
    },
  }
}

export function withLateAdd(drawState: unknown, entryId: string) {
  const base = isPlainObject(drawState) ? drawState : {}
  const swissRepair = getSwissRepairState(drawState)

  return {
    ...base,
    swiss_repair: {
      ...swissRepair,
      late_adds: {
        ...(swissRepair.late_adds || {}),
        [entryId]: createLateAddRepairState(),
      },
    },
  }
}

export function withoutLateAdd(drawState: unknown, entryId: string) {
  const base = isPlainObject(drawState) ? drawState : {}
  const swissRepair = getSwissRepairState(drawState)
  const lateAdds = { ...(swissRepair.late_adds || {}) }

  delete lateAdds[entryId]

  return {
    ...base,
    swiss_repair: {
      ...swissRepair,
      late_adds: lateAdds,
    },
  }
}

export function getSwissRepairWindowStatus(
  matches: SwissRepairWindowMatch[],
  drawState: unknown
): SwissRepairWindowStatus {
  const drawExists = isPlainObject(drawState)
  const phase = drawExists && typeof drawState.phase === "string"
    ? drawState.phase
    : "swiss"
  const knockoutPhase = phase === "knockout"
  const swissMatches = matches.filter((match) => match.phase === "swiss")
  const round1Complete = isRoundComplete(swissMatches, 1)
  const round2Generated = swissMatches.some((match) => match.round >= 2)

  if (!drawExists) {
    return {
      available: false,
      reason: "Generate the Swiss draw first.",
      draw_exists: false,
      round1_complete: false,
      round2_generated: false,
      knockout_phase: false,
    }
  }

  if (knockoutPhase) {
    return {
      available: false,
      reason: "Swiss repair is unavailable once the division enters knockout phase.",
      draw_exists: true,
      round1_complete: round1Complete,
      round2_generated: round2Generated,
      knockout_phase: true,
    }
  }

  if (!round1Complete) {
    return {
      available: false,
      reason: "Finish all Round 1 Swiss matches before revoking entries or adding a late add.",
      draw_exists: true,
      round1_complete: false,
      round2_generated: round2Generated,
      knockout_phase: false,
    }
  }

  if (round2Generated) {
    return {
      available: false,
      reason: "Swiss repair is only available before Round 2 has been generated.",
      draw_exists: true,
      round1_complete: true,
      round2_generated: true,
      knockout_phase: false,
    }
  }

  return {
    available: true,
    draw_exists: true,
    round1_complete: true,
    round2_generated: false,
    knockout_phase: false,
  }
}
