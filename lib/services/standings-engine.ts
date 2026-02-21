/**
 * Standings Engine
 *
 * Calculates Swiss tournament standings from completed matches.
 * Applies tiebreak hierarchy: Wins > Point Diff > Points For > H2H > Deterministic
 *
 * Walkover and bye matches count as W/L but contribute 0 to point aggregations.
 */

import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES, type MatchScoreData } from "@/types/database"

interface StandingRow {
  entry_id: string
  wins: number
  losses: number
  points_for: number
  points_against: number
  tiebreak_json: {
    point_diff: number
    h2h_results: Record<string, 'W' | 'L'>
  }
}

export interface RankedStanding extends StandingRow {
  rank: number
}

/**
 * Calculate standings for a division through a given round.
 * Upserts results into the standings table and returns sorted standings.
 */
export async function calculateStandings(
  divisionId: string,
  throughRound: number
): Promise<{ standings: RankedStanding[]; error?: string }> {
  const supabase = await createClient()

  // Fetch all completed/walkover matches for this division up through the given round
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

  if (!matches || matches.length === 0) {
    return { standings: [], error: "No completed matches found" }
  }

  // Fetch all active entries for this division (to include players with 0 matches)
  const { data: entries } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select("id")
    .eq("division_id", divisionId)
    .eq("status", "active")

  // Build standings map
  const standingsMap = new Map<string, StandingRow>()

  // Initialize all entries with 0s
  for (const entry of entries || []) {
    standingsMap.set(entry.id, {
      entry_id: entry.id,
      wins: 0,
      losses: 0,
      points_for: 0,
      points_against: 0,
      tiebreak_json: { point_diff: 0, h2h_results: {} },
    })
  }

  // Process each match
  for (const match of matches) {
    const sideA = match.side_a_entry_id
    const sideB = match.side_b_entry_id

    // Skip bye matches for point aggregation (but count the win)
    const isBye = !sideB
    const scoreData = match.meta_json as MatchScoreData | null
    const isWalkover = scoreData?.walkover === true || (scoreData as any)?.bye === true

    if (!sideA) continue

    // Ensure entries exist in map
    if (!standingsMap.has(sideA)) {
      standingsMap.set(sideA, {
        entry_id: sideA,
        wins: 0, losses: 0,
        points_for: 0, points_against: 0,
        tiebreak_json: { point_diff: 0, h2h_results: {} },
      })
    }
    if (sideB && !standingsMap.has(sideB)) {
      standingsMap.set(sideB, {
        entry_id: sideB,
        wins: 0, losses: 0,
        points_for: 0, points_against: 0,
        tiebreak_json: { point_diff: 0, h2h_results: {} },
      })
    }

    const standingA = standingsMap.get(sideA)!
    const standingB = sideB ? standingsMap.get(sideB)! : null

    // Record W/L
    if (match.winner_side === 'A') {
      standingA.wins++
      if (standingB) standingB.losses++
    } else if (match.winner_side === 'B' && standingB) {
      standingB.wins++
      standingA.losses++
    }

    // Record H2H (only for non-bye matches)
    if (sideB) {
      if (match.winner_side === 'A') {
        standingA.tiebreak_json.h2h_results[sideB] = 'W'
        standingB!.tiebreak_json.h2h_results[sideA] = 'L'
      } else if (match.winner_side === 'B') {
        standingB!.tiebreak_json.h2h_results[sideA] = 'W'
        standingA.tiebreak_json.h2h_results[sideB] = 'L'
      }
    }

    // Points only from real matches (not walkovers or byes)
    if (!isBye && !isWalkover && scoreData?.games && scoreData.games.length > 0) {
      standingA.points_for += scoreData.total_points_a
      standingA.points_against += scoreData.total_points_b
      if (standingB) {
        standingB.points_for += scoreData.total_points_b
        standingB.points_against += scoreData.total_points_a
      }
    }
  }

  // Calculate point diffs
  for (const standing of standingsMap.values()) {
    standing.tiebreak_json.point_diff = standing.points_for - standing.points_against
  }

  // Sort standings
  const sorted = sortByTiebreaks(Array.from(standingsMap.values()))

  // Assign ranks
  const ranked: RankedStanding[] = sorted.map((s, i) => ({ ...s, rank: i + 1 }))

  // Upsert into standings table
  const upsertData = ranked.map(s => ({
    division_id: divisionId,
    entry_id: s.entry_id,
    round: throughRound,
    wins: s.wins,
    losses: s.losses,
    points_for: s.points_for,
    points_against: s.points_against,
    tiebreak_json: s.tiebreak_json,
  }))

  const { error: upsertError } = await supabase
    .from(TABLE_NAMES.STANDINGS)
    .upsert(upsertData, {
      onConflict: 'division_id,entry_id,round',
    })

  if (upsertError) {
    console.error("Error upserting standings:", upsertError)
    // Non-fatal: standings are still returned even if DB write fails
  }

  return { standings: ranked }
}

/**
 * Sort standings by tiebreak hierarchy:
 * 1. Wins DESC
 * 2. Point Diff DESC
 * 3. Points For DESC
 * 4. H2H (2-player ties only)
 * 5. Deterministic tiebreak (entry_id sort as proxy for coin toss)
 */
export function sortByTiebreaks(standings: StandingRow[]): StandingRow[] {
  return [...standings].sort((a, b) => {
    // 1. Wins DESC
    if (a.wins !== b.wins) return b.wins - a.wins

    // 2. Point Diff DESC
    const diffA = a.tiebreak_json.point_diff
    const diffB = b.tiebreak_json.point_diff
    if (diffA !== diffB) return diffB - diffA

    // 3. Points For DESC
    if (a.points_for !== b.points_for) return b.points_for - a.points_for

    // 4. H2H (only for 2-player ties — handled here as direct comparison)
    const aVsB = a.tiebreak_json.h2h_results[b.entry_id]
    if (aVsB === 'W') return -1
    if (aVsB === 'L') return 1

    // 5. Deterministic tiebreak (entry_id sort)
    return a.entry_id.localeCompare(b.entry_id)
  })
}

/**
 * Get the top N qualifiers from final Swiss standings
 */
export async function getQualifiers(
  divisionId: string
): Promise<{ qualifiers: RankedStanding[]; error?: string }> {
  const supabase = await createClient()

  // Get draw state to find total rounds and qualifier count
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

  // Calculate standings through the final round
  const { standings, error } = await calculateStandings(divisionId, totalRounds)

  if (error) {
    return { qualifiers: [], error }
  }

  return { qualifiers: standings.slice(0, qualifierCount) }
}
