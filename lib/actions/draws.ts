"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import { requireAuth, isTournamentAdminForDivision } from "@/lib/auth/require-auth"
import {
  generateRound1Matches,
  generateNextRoundMatches,
  autoAssignSeeds,
  validateSwissConfig,
  buildPairingHistory,
  getCurrentRound,
  isRoundComplete,
  isSwissPhaseComplete,
} from "@/lib/services/draw-generators/swiss-engine"
import { calculateStandings, getQualifiers } from "@/lib/services/standings-engine"
import { generateKnockoutBracketStructure } from "@/lib/services/draw-generators/knockout-engine"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

async function revalidateDivisionPaths(supabase: ServerSupabase, divisionId: string) {
  const { data } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("tournament_id")
    .eq("id", divisionId)
    .single()

  if (data?.tournament_id) {
    revalidatePath(`/tournaments/${data.tournament_id}/control-center`)
    revalidatePath(`/tournaments/${data.tournament_id}/divisions`)
    revalidatePath(`/tournaments/${data.tournament_id}/divisions/${divisionId}/entries`)
    revalidatePath(`/tournaments/${data.tournament_id}/divisions/${divisionId}/matches`)
  }
}

export async function generateDraw(divisionId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForDivision(supabase, divisionId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Fetch division with config
    const { data: division, error: divisionError } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("*")
      .eq("id", divisionId)
      .single()

    if (divisionError || !division) {
      return { error: "Division not found" }
    }

    // Check if draw already exists
    const { data: existingMatches } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id")
      .eq("division_id", divisionId)
      .limit(1)

    if (existingMatches && existingMatches.length > 0) {
      return { error: "Draw already generated for this division. Delete existing matches first." }
    }

    // Fetch entries
    const { data: entries, error: entriesError } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select("*")
      .eq("division_id", divisionId)

    if (entriesError || !entries || entries.length === 0) {
      return { error: "No entries found in this division" }
    }

    // Check minimum entries
    if (entries.length < 2) {
      return { error: "Need at least 2 entries to generate draw" }
    }

    // Auto-assign seeds if needed
    const seededEntries = autoAssignSeeds(entries)

    // Update seeds in database if any were auto-assigned
    const unseededOriginal = entries.filter(e => e.seed === null)
    if (unseededOriginal.length > 0) {
      const updates = seededEntries
        .filter(e => unseededOriginal.find(orig => orig.id === e.id))
        .map(e => ({
          id: e.id,
          seed: e.seed,
        }))

      for (const update of updates) {
        await supabase
          .from(TABLE_NAMES.ENTRIES)
          .update({ seed: update.seed })
          .eq("id", update.id)
      }
    }

    // Generate matches based on format
    let matches: any[] = []

    if (division.format === "swiss") {
      const rulesJson = division.rules_json as any
      const config = {
        rounds: rulesJson?.swiss_rounds || 5,
        qualifiers: rulesJson?.swiss_qualifiers || 0,
      }

      // Validate config
      const validation = validateSwissConfig(config, seededEntries.length)
      if (!validation.valid) {
        return { error: validation.error }
      }

      // Generate Round 1 matches
      matches = generateRound1Matches(divisionId, seededEntries, config)
    } else if (division.format === "mexicano") {
      // TODO: Implement Mexicano pairing
      return { error: "Mexicano format not yet implemented" }
    } else if (division.format === "groups_knockout") {
      // TODO: Implement Groups format
      return { error: "Groups format not yet implemented" }
    } else {
      return { error: `Unknown format: ${division.format}` }
    }

    // Insert matches
    const { data: insertedMatches, error: matchError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .insert(matches)
      .select()

    if (matchError) {
      console.error("Error creating matches:", matchError)
      return { error: `Failed to create matches: ${matchError.message}` }
    }

    // Auto-complete bye matches (where side_b is null)
    const byeMatches = insertedMatches?.filter(m => m.side_b_entry_id === null) || []
    for (const byeMatch of byeMatches) {
      await supabase
        .from(TABLE_NAMES.MATCHES)
        .update({
          status: 'completed',
          winner_side: 'A',
          meta_json: { games: [], total_points_a: 0, total_points_b: 0, walkover: false, bye: true },
        })
        .eq("id", byeMatch.id)
    }

    // Create draw state record
    const rulesJsonForDraw = division.rules_json as any
    const byeEntryIds = byeMatches.map(m => m.side_a_entry_id).filter(Boolean)
    await supabase
      .from(TABLE_NAMES.DRAWS)
      .insert({
        division_id: divisionId,
        type: division.format,
        state_json: {
          current_round: 1,
          total_rounds: rulesJsonForDraw?.swiss_rounds || 5,
          qualifiers: rulesJsonForDraw?.swiss_qualifiers || 0,
          phase: 'swiss',
          bye_history: byeEntryIds,
        },
      })

    // Mark division as published
    await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .update({ is_published: true })
      .eq("id", divisionId)

    await revalidateDivisionPaths(supabase, divisionId)

    return {
      success: true,
      matchCount: insertedMatches?.length || 0,
      message: `Generated ${insertedMatches?.length || 0} matches for Round 1`,
    }
  } catch (error) {
    console.error("Error in generateDraw:", error)
    return { error: "Failed to generate draw" }
  }
}

export async function deleteAllMatches(divisionId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForDivision(supabase, divisionId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Delete all matches for this division
    const { error } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .delete()
      .eq("division_id", divisionId)

    if (error) {
      console.error("Error deleting matches:", error)
      return { error: error.message }
    }

    // Delete draw state
    await supabase
      .from(TABLE_NAMES.DRAWS)
      .delete()
      .eq("division_id", divisionId)

    // Delete standings
    await supabase
      .from(TABLE_NAMES.STANDINGS)
      .delete()
      .eq("division_id", divisionId)

    // Mark division as unpublished
    await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .update({ is_published: false })
      .eq("id", divisionId)

    await revalidateDivisionPaths(supabase, divisionId)

    return { success: true }
  } catch (error) {
    console.error("Error in deleteAllMatches:", error)
    return { error: "Failed to delete matches" }
  }
}

/**
 * Generate the next Swiss round for a division.
 * Requires the current round to be complete.
 */
export async function generateNextSwissRound(divisionId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForDivision(supabase, divisionId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Fetch draw state
    const { data: draw } = await supabase
      .from(TABLE_NAMES.DRAWS)
      .select("id, state_json")
      .eq("division_id", divisionId)
      .single()

    if (!draw) {
      return { error: "No draw found for this division. Generate Round 1 first." }
    }

    const stateJson = draw.state_json as any
    const totalRounds = stateJson?.total_rounds || 5

    // Fetch all matches to determine current round and completion status
    const { data: allMatches } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id, round, sequence, status, phase, side_a_entry_id, side_b_entry_id")
      .eq("division_id", divisionId)

    if (!allMatches || allMatches.length === 0) {
      return { error: "No matches found. Generate Round 1 first." }
    }

    const currentRound = getCurrentRound(allMatches)

    // Check if Swiss phase is already complete
    if (isSwissPhaseComplete(allMatches, totalRounds)) {
      return { error: `All ${totalRounds} Swiss rounds are complete. Generate knockout bracket instead.` }
    }

    // Check if current round is complete
    if (!isRoundComplete(allMatches, currentRound)) {
      return { error: `Round ${currentRound} is not yet complete. Finish all matches before generating the next round.` }
    }

    const nextRound = currentRound + 1
    if (nextRound > totalRounds) {
      return { error: `All ${totalRounds} Swiss rounds are complete.` }
    }

    // Calculate standings through current round
    const { standings, error: standingsError } = await calculateStandings(divisionId, currentRound)
    if (standingsError || !standings || standings.length === 0) {
      return { error: standingsError || "Failed to calculate standings" }
    }

    // Build pairing history from all completed Swiss matches
    const completedMatches = allMatches.filter(m =>
      m.phase === 'swiss' && (m.status === 'completed' || m.status === 'walkover')
    )
    const pairingHistory = buildPairingHistory(completedMatches)
    const byeHistory: string[] = stateJson?.bye_history || []

    // Generate next round matches
    const standingsForPairing = standings.map(s => ({
      entry_id: s.entry_id,
      wins: s.wins,
      points_for: s.points_for,
      points_against: s.points_against,
    }))

    const newMatches = generateNextRoundMatches(
      divisionId,
      nextRound,
      standingsForPairing,
      pairingHistory,
      byeHistory
    )

    if (newMatches.length === 0) {
      return { error: "Failed to generate pairings for next round" }
    }

    // Insert new matches
    const { data: insertedMatches, error: insertError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .insert(newMatches)
      .select()

    if (insertError) {
      return { error: `Failed to create matches: ${insertError.message}` }
    }

    // Auto-complete bye matches
    const byeMatches = insertedMatches?.filter(m => m.side_b_entry_id === null) || []
    for (const byeMatch of byeMatches) {
      await supabase
        .from(TABLE_NAMES.MATCHES)
        .update({
          status: 'completed',
          winner_side: 'A',
          meta_json: { games: [], total_points_a: 0, total_points_b: 0, walkover: false, bye: true },
        })
        .eq("id", byeMatch.id)
    }

    // Update draw state
    const newByeEntryIds = byeMatches.map(m => m.side_a_entry_id).filter(Boolean)
    const updatedByeHistory = [...byeHistory, ...newByeEntryIds]

    await supabase
      .from(TABLE_NAMES.DRAWS)
      .update({
        state_json: {
          ...stateJson,
          current_round: nextRound,
          bye_history: updatedByeHistory,
        },
      })
      .eq("id", draw.id)

    await revalidateDivisionPaths(supabase, divisionId)

    return {
      success: true,
      matchCount: insertedMatches?.length || 0,
      message: `Generated ${insertedMatches?.length || 0} matches for Round ${nextRound}`,
    }
  } catch (error) {
    console.error("Error in generateNextSwissRound:", error)
    return { error: "Failed to generate next round" }
  }
}

/**
 * Generate a knockout bracket from Swiss qualifiers.
 * Requires all Swiss rounds to be complete.
 */
export async function generateKnockoutDraw(divisionId: string) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    const isAdmin = await isTournamentAdminForDivision(supabase, divisionId, user.id)
    if (!isAdmin) return { error: "Not authorized for this tournament" }

    // Check that no knockout matches already exist
    const { data: existingKnockout } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("id")
      .eq("division_id", divisionId)
      .eq("phase", "knockout")
      .limit(1)

    if (existingKnockout && existingKnockout.length > 0) {
      return { error: "Knockout bracket already generated for this division." }
    }

    // Fetch draw state to verify Swiss is complete
    const { data: draw } = await supabase
      .from(TABLE_NAMES.DRAWS)
      .select("id, state_json")
      .eq("division_id", divisionId)
      .single()

    if (!draw) {
      return { error: "No draw found. Complete Swiss rounds first." }
    }

    const stateJson = draw.state_json as any
    const totalRounds = stateJson?.total_rounds || 5

    // Verify all Swiss rounds are complete
    const { data: allMatches } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select("round, status, phase")
      .eq("division_id", divisionId)

    if (!allMatches || !isSwissPhaseComplete(allMatches, totalRounds)) {
      return { error: "Swiss phase is not yet complete. Finish all Swiss rounds first." }
    }

    // Get qualifiers
    const { qualifiers, error: qualError } = await getQualifiers(divisionId)
    if (qualError || !qualifiers || qualifiers.length === 0) {
      return { error: qualError || "No qualifiers found" }
    }

    // Generate bracket structure
    const qualifierData = qualifiers.map(q => ({
      entry_id: q.entry_id,
      rank: q.rank,
    }))

    const { matches: bracketMatches } = generateKnockoutBracketStructure(
      divisionId,
      qualifierData
    )

    // Insert matches without next_match_id first (need DB IDs)
    const matchesForInsert = bracketMatches.map(m => {
      const { next_match_id, next_match_side, ...rest } = m
      // Remove the temporary _next_match_key
      const { _next_match_key, ...insertData } = rest as any
      return insertData
    })

    const { data: insertedMatches, error: insertError } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .insert(matchesForInsert)
      .select()

    if (insertError || !insertedMatches) {
      return { error: `Failed to create knockout matches: ${insertError?.message}` }
    }

    // Build a map from "round-sequence" to actual DB ID
    const dbIdMap = new Map<string, string>()
    for (const match of insertedMatches) {
      dbIdMap.set(`${match.round}-${match.sequence}`, match.id)
    }

    // Update next_match_id references
    for (let i = 0; i < bracketMatches.length; i++) {
      const nextKey = (bracketMatches[i] as any)._next_match_key
      const nextSide = bracketMatches[i].next_match_side
      if (!nextKey || !nextSide) continue

      const nextMatchId = dbIdMap.get(nextKey)
      const currentMatchId = insertedMatches[i].id

      if (nextMatchId) {
        await supabase
          .from(TABLE_NAMES.MATCHES)
          .update({
            next_match_id: nextMatchId,
            next_match_side: nextSide,
          })
          .eq("id", currentMatchId)
      }
    }

    // Update draw state to knockout phase
    await supabase
      .from(TABLE_NAMES.DRAWS)
      .update({
        state_json: {
          ...stateJson,
          phase: 'knockout',
          bracket_size: qualifiers.length,
        },
      })
      .eq("id", draw.id)

    await revalidateDivisionPaths(supabase, divisionId)

    return {
      success: true,
      matchCount: insertedMatches.length,
      message: `Generated knockout bracket with ${qualifiers.length} qualifiers (${insertedMatches.length} matches)`,
    }
  } catch (error) {
    console.error("Error in generateKnockoutDraw:", error)
    return { error: "Failed to generate knockout bracket" }
  }
}
