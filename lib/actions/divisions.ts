"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { divisionSchema, type DivisionFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES } from "@/types/database"

export async function createDivision(data: DivisionFormData, tournamentId: string) {
  try {
    // Validate input
    const validatedData = divisionSchema.parse(data)

    const supabase = await createClient()

    // Verify user has access to this tournament
    const { data: tournament } = await supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .select("created_by")
      .eq("id", tournamentId)
      .single()

    if (!tournament) {
      return { error: "Tournament not found" }
    }

    // Insert division
    const { data: division, error } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .insert({
        sport: validatedData.sport,
        name: validatedData.name,
        play_mode: validatedData.play_mode,
        format: validatedData.format,
        draw_size: validatedData.draw_size,
        rules_json: validatedData.rules_json || {},
        tournament_id: tournamentId,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating division:", error)
      return { error: error.message }
    }

    // Revalidate the divisions page
    revalidatePath(`/tournaments/${tournamentId}/divisions`)

    return { data: division }
  } catch (error) {
    console.error("Error in createDivision:", error)
    return { error: "Failed to create division" }
  }
}

export async function updateDivision(divisionId: string, data: DivisionFormData) {
  try {
    // Validate input
    const validatedData = divisionSchema.parse(data)

    const supabase = await createClient()

    // Get division with tournament_id and check if published (draw generated)
    const { data: division } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("tournament_id, is_published")
      .eq("id", divisionId)
      .single()

    if (!division) {
      return { error: "Division not found" }
    }

    // Block editing format/rules after draw has been generated
    if (division.is_published) {
      return { error: "Cannot edit division after draw has been generated. Delete the draw first." }
    }

    // Update division
    const { data: updatedDivision, error } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .update({
        sport: validatedData.sport,
        name: validatedData.name,
        play_mode: validatedData.play_mode,
        format: validatedData.format,
        draw_size: validatedData.draw_size,
        rules_json: validatedData.rules_json || {},
      })
      .eq("id", divisionId)
      .select()
      .single()

    if (error) {
      console.error("Error updating division:", error)
      return { error: error.message }
    }

    // Revalidate the divisions page
    revalidatePath(`/tournaments/${division.tournament_id}/divisions`)

    return { data: updatedDivision }
  } catch (error) {
    console.error("Error in updateDivision:", error)
    return { error: "Failed to update division" }
  }
}

export async function deleteDivision(divisionId: string) {
  try {
    const supabase = await createClient()

    // Get tournament_id for revalidation
    const { data: division } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("tournament_id")
      .eq("id", divisionId)
      .single()

    if (!division) {
      return { error: "Division not found" }
    }

    // Delete division (cascades to entries and matches via foreign key)
    const { error } = await supabase
      .from(TABLE_NAMES.DIVISIONS)
      .delete()
      .eq("id", divisionId)

    if (error) {
      console.error("Error deleting division:", error)
      return { error: error.message }
    }

    // Revalidate the divisions page
    revalidatePath(`/tournaments/${division.tournament_id}/divisions`)

    return { success: true }
  } catch (error) {
    console.error("Error in deleteDivision:", error)
    return { error: "Failed to delete division" }
  }
}
