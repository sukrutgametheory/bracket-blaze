"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"

export async function createEntry(
  divisionId: string,
  participantId: string,
  seed: number | null
) {
  try {
    const supabase = await createClient()

    // Verify division exists and get tournament_id
    const { data: division } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("tournament_id, draw_size")
      .eq("id", divisionId)
      .single()

    if (!division) {
      return { error: "Division not found" }
    }

    // Check if participant is already in this division
    const { data: existingEntry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select("id")
      .eq("division_id", divisionId)
      .eq("participant_id", participantId)
      .single()

    if (existingEntry) {
      return { error: "Participant is already in this division" }
    }

    // Check if division is full
    const { count } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select("*", { count: "exact", head: true })
      .eq("division_id", divisionId)

    if (count !== null && count >= division.draw_size) {
      return { error: "Division is full" }
    }

    // If seed provided, check if it's already taken
    if (seed !== null) {
      const { data: seedTaken } = await supabase
        .from(TABLE_NAMES.ENTRIES)
        .select("id")
        .eq("division_id", divisionId)
        .eq("seed", seed)
        .single()

      if (seedTaken) {
        return { error: `Seed ${seed} is already taken` }
      }
    }

    // Insert entry
    const { data: entry, error } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .insert({
        division_id: divisionId,
        participant_id: participantId,
        seed: seed,
        status: "active",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating entry:", error)
      return { error: error.message }
    }

    // Revalidate the entries page
    revalidatePath(`/tournaments/${division.tournament_id}/divisions/${divisionId}/entries`)
    revalidatePath(`/tournaments/${division.tournament_id}/divisions`)

    return { data: entry }
  } catch (error) {
    console.error("Error in createEntry:", error)
    return { error: "Failed to create entry" }
  }
}

export async function updateEntry(entryId: string, seed: number | null) {
  try {
    const supabase = await createClient()

    // Get entry details for revalidation
    const { data: entry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select(`
        division_id,
        division:bracket_blaze_divisions(tournament_id)
      `)
      .eq("id", entryId)
      .single()

    if (!entry) {
      return { error: "Entry not found" }
    }

    // If seed provided, check if it's already taken by another entry
    if (seed !== null) {
      const { data: seedTaken } = await supabase
        .from(TABLE_NAMES.ENTRIES)
        .select("id")
        .eq("division_id", entry.division_id)
        .eq("seed", seed)
        .neq("id", entryId)
        .single()

      if (seedTaken) {
        return { error: `Seed ${seed} is already taken` }
      }
    }

    // Update entry
    const { data: updatedEntry, error } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .update({ seed })
      .eq("id", entryId)
      .select()
      .single()

    if (error) {
      console.error("Error updating entry:", error)
      return { error: error.message }
    }

    // Revalidate the entries page
    const tournamentId = (entry.division as any).tournament_id
    revalidatePath(`/tournaments/${tournamentId}/divisions/${entry.division_id}/entries`)

    return { data: updatedEntry }
  } catch (error) {
    console.error("Error in updateEntry:", error)
    return { error: "Failed to update entry" }
  }
}

export async function deleteEntry(entryId: string) {
  try {
    const supabase = await createClient()

    // Get entry details for revalidation
    const { data: entry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select(`
        division_id,
        division:bracket_blaze_divisions(tournament_id)
      `)
      .eq("id", entryId)
      .single()

    if (!entry) {
      return { error: "Entry not found" }
    }

    // Delete entry
    const { error } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .delete()
      .eq("id", entryId)

    if (error) {
      console.error("Error deleting entry:", error)
      return { error: error.message }
    }

    // Revalidate the entries page
    const tournamentId = (entry.division as any).tournament_id
    revalidatePath(`/tournaments/${tournamentId}/divisions/${entry.division_id}/entries`)
    revalidatePath(`/tournaments/${tournamentId}/divisions`)

    return { success: true }
  } catch (error) {
    console.error("Error in deleteEntry:", error)
    return { error: "Failed to delete entry" }
  }
}
