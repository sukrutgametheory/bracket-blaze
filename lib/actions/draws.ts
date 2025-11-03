"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import {
  generateRound1Matches,
  autoAssignSeeds,
  validateSwissConfig,
} from "@/lib/services/draw-generators/swiss-engine"

export async function generateDraw(divisionId: string) {
  try {
    const supabase = await createClient()

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

    // Mark division as published
    await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .update({ is_published: true })
      .eq("id", divisionId)

    // Get tournament_id for revalidation
    const { data: tournamentData } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("tournament_id")
      .eq("id", divisionId)
      .single()

    if (tournamentData) {
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions`)
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions/${divisionId}/entries`)
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions/${divisionId}/matches`)
    }

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
    const supabase = await createClient()

    // Delete all matches for this division
    const { error } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .delete()
      .eq("division_id", divisionId)

    if (error) {
      console.error("Error deleting matches:", error)
      return { error: error.message }
    }

    // Mark division as unpublished
    await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .update({ is_published: false })
      .eq("id", divisionId)

    // Get tournament_id for revalidation
    const { data: tournamentData } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("tournament_id")
      .eq("id", divisionId)
      .single()

    if (tournamentData) {
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions`)
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions/${divisionId}/entries`)
      revalidatePath(`/tournaments/${tournamentData.tournament_id}/divisions/${divisionId}/matches`)
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deleteAllMatches:", error)
    return { error: "Failed to delete matches" }
  }
}
