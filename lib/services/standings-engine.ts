/**
 * Standings Engine
 *
 * Calculates Swiss tournament standings from completed matches.
 * Applies tiebreak hierarchy: Wins > Pairing Priority > Point Diff > Points For > H2H > Deterministic
 *
 * Swiss repair support:
 * - Revoked-entry matches can be excluded from repaired standings while still remaining in results history
 * - Late adds can start with a seeded 0-1 record and sort to the bottom of the 0-win bucket
 */

import { createClient } from "@/lib/supabase/server"
import {
  getExcludedMatchIds,
  getLateAddRepairState,
  isCompetitionActiveEntryStatus,
} from "@/lib/services/swiss-repair"
import { TABLE_NAMES, type MatchScoreData } from "@/types/database"

interface StandingRow {
  entry_id: string
  wins: number
  losses: number
  points_for: number
  points_against: number
  pairing_bucket_priority: number
  played_match_count: number
  tiebreak_json: {
    point_diff: number
    h2h_results: Record<string, "W" | "L">
  }
}

export interface RankedStanding extends StandingRow {
  rank: number
}

export async function calculateStandings(
  divisionId: string,
  throughRound: number
): Promise<{ standings: RankedStanding[]; error?: string }> {
  const supabase = await createClient()

  const { data: draw } = await supabase
    .from(TABLE_NAMES.DRAWS)
    .select("state_json")
    .eq("division_id", divisionId)
    .maybeSingle()

  const excludedMatchIds = new Set(getExcludedMatchIds(draw?.state_json))

  const { data: entries, error: entriesError } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select("id, status")
    .eq("division_id", divisionId)

  if (entriesError) {
    return { standings: [], error: entriesError.message }
  }

  const standingsMap = new Map<string, StandingRow>()

  for (const entry of entries || []) {
    if (!isCompetitionActiveEntryStatus(entry.status)) continue

    const lateAddRepairState = getLateAddRepairState(draw?.state_json, entry.id)
    standingsMap.set(entry.id, {
      entry_id: entry.id,
      wins: lateAddRepairState?.initial_wins || 0,
      losses: lateAddRepairState?.initial_losses || 0,
      points_for: 0,
      points_against: 0,
      pairing_bucket_priority: lateAddRepairState ? 1 : 0,
      played_match_count: 0,
      tiebreak_json: { point_diff: 0, h2h_results: {} },
    })
  }

  const { data: matches, error: matchError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("id, round, side_a_entry_id, side_b_entry_id, winner_side, meta_json, status, phase")
    .eq("division_id", divisionId)
    .eq("phase", "swiss")
    .lte("round", throughRound)
    .in("status", ["completed", "walkover"])

  if (matchError) {
    return { standings: [], error: matchError.message }
  }

  for (const match of matches || []) {
    if (excludedMatchIds.has(match.id)) continue

    const sideA = match.side_a_entry_id
    const sideB = match.side_b_entry_id
    const standingA = sideA ? standingsMap.get(sideA) : undefined
    const standingB = sideB ? standingsMap.get(sideB) : undefined

    if (!standingA && !standingB) continue

    const isBye = !sideB
    const scoreData = match.meta_json as MatchScoreData | null
    const isWalkover = scoreData?.walkover === true || (scoreData as any)?.bye === true

    if (standingA) standingA.played_match_count++
    if (standingB) standingB.played_match_count++

    if (match.winner_side === "A" && standingA) {
      standingA.wins++
      if (standingB) standingB.losses++
    } else if (match.winner_side === "B" && standingB) {
      standingB.wins++
      if (standingA) standingA.losses++
    }

    if (standingA && standingB) {
      if (match.winner_side === "A") {
        standingA.tiebreak_json.h2h_results[standingB.entry_id] = "W"
        standingB.tiebreak_json.h2h_results[standingA.entry_id] = "L"
      } else if (match.winner_side === "B") {
        standingB.tiebreak_json.h2h_results[standingA.entry_id] = "W"
        standingA.tiebreak_json.h2h_results[standingB.entry_id] = "L"
      }
    }

    if (!isBye && !isWalkover && scoreData?.games && scoreData.games.length > 0 && standingA && standingB) {
      standingA.points_for += scoreData.total_points_a
      standingA.points_against += scoreData.total_points_b
      standingB.points_for += scoreData.total_points_b
      standingB.points_against += scoreData.total_points_a
    }
  }

  if (standingsMap.size === 0) {
    return { standings: [], error: "No competition-eligible entries found" }
  }

  for (const standing of standingsMap.values()) {
    standing.tiebreak_json.point_diff = standing.points_for - standing.points_against
    if (standing.played_match_count > 0) {
      standing.pairing_bucket_priority = 0
    }
  }

  const sorted = sortByTiebreaks(Array.from(standingsMap.values()))
  const ranked: RankedStanding[] = sorted.map((standing, index) => ({
    ...standing,
    rank: index + 1,
  }))

  const upsertData = ranked.map((standing) => ({
    division_id: divisionId,
    entry_id: standing.entry_id,
    round: throughRound,
    wins: standing.wins,
    losses: standing.losses,
    points_for: standing.points_for,
    points_against: standing.points_against,
    tiebreak_json: standing.tiebreak_json,
  }))

  const { error: upsertError } = await supabase
    .from(TABLE_NAMES.STANDINGS)
    .upsert(upsertData, {
      onConflict: "division_id,entry_id,round",
    })

  if (upsertError) {
    console.error("Error upserting standings:", upsertError)
  }

  return { standings: ranked }
}

export function sortByTiebreaks(standings: StandingRow[]): StandingRow[] {
  return [...standings].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins
    if (a.pairing_bucket_priority !== b.pairing_bucket_priority) {
      return a.pairing_bucket_priority - b.pairing_bucket_priority
    }

    const diffA = a.tiebreak_json.point_diff
    const diffB = b.tiebreak_json.point_diff
    if (diffA !== diffB) return diffB - diffA

    if (a.points_for !== b.points_for) return b.points_for - a.points_for

    const aVsB = a.tiebreak_json.h2h_results[b.entry_id]
    if (aVsB === "W") return -1
    if (aVsB === "L") return 1

    return a.entry_id.localeCompare(b.entry_id)
  })
}

export async function getQualifiers(
  divisionId: string
): Promise<{ qualifiers: RankedStanding[]; error?: string }> {
  const supabase = await createClient()

  const { data: draw } = await supabase
    .from(TABLE_NAMES.DRAWS)
    .select("state_json")
    .eq("division_id", divisionId)
    .single()

  if (!draw) {
    return { qualifiers: [], error: "No draw state found" }
  }

  const stateJson = draw.state_json as any
  const totalRounds = stateJson?.total_rounds || 5
  const qualifierCount = stateJson?.qualifiers || 0

  if (qualifierCount === 0) {
    return { qualifiers: [], error: "No qualifiers configured for this division" }
  }

  const { standings, error } = await calculateStandings(divisionId, totalRounds)
  if (error) {
    return { qualifiers: [], error }
  }

  return { qualifiers: standings.slice(0, qualifierCount) }
}
