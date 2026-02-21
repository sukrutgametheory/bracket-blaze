"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES, type MatchStatus, type WinnerSide, type GameScore, type MatchScoreData } from "@/types/database"
import { requireAuth, isTournamentAdminForMatch } from "@/lib/auth/require-auth"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

// Valid match state transitions
const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  scheduled: ['ready', 'walkover'],
  ready: ['scheduled', 'on_court', 'walkover'],
  on_court: ['pending_signoff', 'completed', 'walkover'],
  pending_signoff: ['completed', 'on_court', 'walkover'],
  completed: [],
  walkover: [],
}

function isValidTransition(from: MatchStatus, to: MatchStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

async function revalidateMatchPaths(supabase: ServerSupabase, divisionId: string) {
  const { data } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", divisionId)
    .single()

  if (data?.tournament_id) {
    revalidatePath(`/tournaments/${data.tournament_id}/control-center`)
    revalidatePath(`/tournaments/${data.tournament_id}/divisions/${divisionId}/matches`)
  }
}

/**
 * Start a match — transitions from 'ready' to 'on_court'
 */
export async function startMatch(matchId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (!isValidTransition(match.status, 'on_court')) {
      return { error: `Cannot start match: current status is '${match.status}', expected 'ready'` }
    }

    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        status: 'on_court',
        actual_start_time: new Date().toISOString(),
      })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    await revalidateMatchPaths(supabase, match.division_id)

    return { success: true, message: "Match started" }
  } catch (error) {
    console.error("Error in startMatch:", error)
    return { error: "Failed to start match" }
  }
}

/**
 * Shared finalization logic: set match to completed with score data,
 * advance knockout winner, clear live_score, revalidate paths.
 * Used by both completeMatch (TD direct) and approveMatch (TD sign-off).
 */
async function finalizeMatch(
  supabase: ServerSupabase,
  matchId: string,
  divisionId: string,
  phase: string,
  winnerSide: WinnerSide,
  games: GameScore[]
) {
  const totalPointsA = games.reduce((sum, g) => sum + g.score_a, 0)
  const totalPointsB = games.reduce((sum, g) => sum + g.score_b, 0)

  const scoreData: MatchScoreData = {
    games,
    total_points_a: totalPointsA,
    total_points_b: totalPointsB,
  }

  const { error: updateError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({
      status: 'completed',
      winner_side: winnerSide,
      actual_end_time: new Date().toISOString(),
      meta_json: scoreData,
      court_id: null,
    })
    .eq("id", matchId)

  if (updateError) {
    return { error: updateError.message }
  }

  // If knockout match, advance winner to next match
  if (phase === 'knockout') {
    await advanceKnockoutWinner(supabase, matchId, winnerSide)
  }

  await revalidateMatchPaths(supabase, divisionId)

  return { success: true, scoreData }
}

/**
 * Complete a match — transitions from 'on_court' to 'completed'
 * Records winner and game scores (TD direct path)
 */
export async function completeMatch(
  matchId: string,
  winnerSide: WinnerSide,
  games: GameScore[]
) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id, phase")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (!isValidTransition(match.status, 'completed')) {
      return { error: `Cannot complete match: current status is '${match.status}', expected 'on_court'` }
    }

    // Validate game scores
    if (!games || games.length === 0) {
      return { error: "At least one game score is required" }
    }

    for (const game of games) {
      if (game.score_a < 0 || game.score_b < 0) {
        return { error: "Game scores cannot be negative" }
      }
    }

    const result = await finalizeMatch(supabase, matchId, match.division_id, match.phase, winnerSide, games)
    if (result.error) return result

    return {
      success: true,
      message: "Match completed",
      scoreData: result.scoreData,
    }
  } catch (error) {
    console.error("Error in completeMatch:", error)
    return { error: "Failed to complete match" }
  }
}

/**
 * Approve a match — transitions from 'pending_signoff' to 'completed'
 * TD approves a referee-submitted match. Determines winner from game scores.
 */
export async function approveMatch(matchId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id, phase, meta_json")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (!isValidTransition(match.status as MatchStatus, 'completed')) {
      return { error: `Cannot approve match: current status is '${match.status}', expected 'pending_signoff'` }
    }

    // Get games from meta_json
    const metaJson = match.meta_json as MatchScoreData | null
    const games = metaJson?.games || []
    if (games.length === 0) {
      return { error: "Cannot approve match with no game scores" }
    }

    // Determine winner from game scores
    let aWins = 0
    let bWins = 0
    for (const game of games) {
      if (game.score_a > game.score_b) aWins++
      else if (game.score_b > game.score_a) bWins++
    }

    if (aWins === bWins) {
      return { error: "Cannot determine winner — game wins are tied. Reject and have referee continue." }
    }

    const winnerSide: WinnerSide = aWins > bWins ? 'A' : 'B'

    // Write td_approve event
    await supabase.from(TABLE_NAMES.MATCH_EVENTS).insert({
      match_id: matchId,
      event_type: 'td_approve',
      payload_json: { games, winner_side: winnerSide },
    })

    const result = await finalizeMatch(supabase, matchId, match.division_id, match.phase, winnerSide, games)
    if (result.error) return result

    return { success: true, message: "Match approved" }
  } catch (error) {
    console.error("Error in approveMatch:", error)
    return { error: "Failed to approve match" }
  }
}

/**
 * Reject a match — transitions from 'pending_signoff' back to 'on_court'
 * TD rejects a referee-submitted match so the referee can continue scoring.
 */
export async function rejectMatch(matchId: string, note?: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (!isValidTransition(match.status as MatchStatus, 'on_court')) {
      return { error: `Cannot reject match: current status is '${match.status}', expected 'pending_signoff'` }
    }

    // Write td_reject event with optional note
    await supabase.from(TABLE_NAMES.MATCH_EVENTS).insert({
      match_id: matchId,
      event_type: 'td_reject',
      payload_json: { note: note || '' },
    })

    // Transition back to on_court
    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({ status: 'on_court' })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    await revalidateMatchPaths(supabase, match.division_id)

    return { success: true, message: "Match rejected — referee can continue scoring" }
  } catch (error) {
    console.error("Error in rejectMatch:", error)
    return { error: "Failed to reject match" }
  }
}

/**
 * Record a walkover — transitions to 'walkover' from any pre-completed status
 * Walkovers count as W/L but contribute 0 to point aggregations
 */
export async function recordWalkover(
  matchId: string,
  winnerSide: WinnerSide
) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id, phase")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (!isValidTransition(match.status, 'walkover')) {
      return { error: `Cannot record walkover: current status is '${match.status}'` }
    }

    const scoreData: MatchScoreData = {
      games: [],
      total_points_a: 0,
      total_points_b: 0,
      walkover: true,
    }

    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        status: 'walkover',
        winner_side: winnerSide,
        actual_end_time: new Date().toISOString(),
        meta_json: scoreData,
        court_id: null,
      })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    // If knockout match, advance winner to next match
    if (match.phase === 'knockout') {
      await advanceKnockoutWinner(supabase, matchId, winnerSide)
    }

    await revalidateMatchPaths(supabase, match.division_id)

    return { success: true, message: "Walkover recorded" }
  } catch (error) {
    console.error("Error in recordWalkover:", error)
    return { error: "Failed to record walkover" }
  }
}

/**
 * Edit a completed match's score — updates meta_json and winner_side
 * without changing the match status. Used by the TD to correct scores
 * before generating the next round.
 */
export async function editMatchScore(
  matchId: string,
  winnerSide: WinnerSide,
  games: GameScore[]
) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForMatch(supabase, matchId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    const { data: match, error: fetchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, status, division_id, phase, winner_side, next_match_id, next_match_side, side_a_entry_id, side_b_entry_id")
      .eq("id", matchId)
      .single()

    if (fetchError || !match) {
      return { error: "Match not found" }
    }

    if (match.status !== 'completed' && match.status !== 'walkover') {
      return { error: `Cannot edit score: match status is '${match.status}', expected 'completed' or 'walkover'` }
    }

    // Validate game scores
    if (!games || games.length === 0) {
      return { error: "At least one game score is required" }
    }

    for (const game of games) {
      if (game.score_a < 0 || game.score_b < 0) {
        return { error: "Game scores cannot be negative" }
      }
    }

    // If knockout match and winner is changing, guard against next match in progress
    const winnerChanged = match.winner_side !== winnerSide
    if (winnerChanged && match.phase === 'knockout' && match.next_match_id) {
      const { data: nextMatch } = await supabase
        .from(TABLE_NAMES.MATCHES)
        .select("id, status")
        .eq("id", match.next_match_id)
        .single()

      if (nextMatch && nextMatch.status !== 'scheduled') {
        return { error: "Cannot change winner — next match already in progress" }
      }
    }

    const totalPointsA = games.reduce((sum, g) => sum + g.score_a, 0)
    const totalPointsB = games.reduce((sum, g) => sum + g.score_b, 0)

    const scoreData: MatchScoreData = {
      games,
      total_points_a: totalPointsA,
      total_points_b: totalPointsB,
    }

    const { error: updateError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .update({
        status: 'completed',
        winner_side: winnerSide,
        meta_json: scoreData,
      })
      .eq("id", matchId)

    if (updateError) {
      return { error: updateError.message }
    }

    // If knockout match and winner changed, update the next match entry
    if (winnerChanged && match.phase === 'knockout' && match.next_match_id && match.next_match_side) {
      const newWinnerEntryId = winnerSide === 'A'
        ? match.side_a_entry_id
        : match.side_b_entry_id

      const updateField = match.next_match_side === 'A'
        ? 'side_a_entry_id'
        : 'side_b_entry_id'

      if (newWinnerEntryId) {
        await supabase
          .from(TABLE_NAMES.MATCHES)
          .update({ [updateField]: newWinnerEntryId })
          .eq("id", match.next_match_id)
      }
    }

    await revalidateMatchPaths(supabase, match.division_id)

    return { success: true, message: "Score updated" }
  } catch (error) {
    console.error("Error in editMatchScore:", error)
    return { error: "Failed to edit score" }
  }
}

/**
 * After a knockout match completes, advance the winner to the next match
 */
async function advanceKnockoutWinner(
  supabase: ServerSupabase,
  matchId: string,
  winnerSide: WinnerSide
) {
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("id, next_match_id, next_match_side, side_a_entry_id, side_b_entry_id")
    .eq("id", matchId)
    .single()

  if (!match?.next_match_id || !match?.next_match_side) return

  const winnerEntryId = winnerSide === 'A'
    ? match.side_a_entry_id
    : match.side_b_entry_id

  if (!winnerEntryId) return

  const updateField = match.next_match_side === 'A'
    ? 'side_a_entry_id'
    : 'side_b_entry_id'

  await supabase
    .from(TABLE_NAMES.MATCHES)
    .update({ [updateField]: winnerEntryId })
    .eq("id", match.next_match_id)
}
