"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { courtSchema, type CourtFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES } from "@/types/database"

export async function createCourt(data: CourtFormData, tournamentId: string) {
  try {
    // Validate input
    const validatedData = courtSchema.parse(data)

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

    // Insert court
    const { data: court, error } = await supabase
      .from(TABLE_NAMES.COURTS)
      .insert({
        name: validatedData.name,
        is_active: validatedData.is_active,
        tournament_id: tournamentId,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating court:", error)
      return { error: error.message }
    }

    // Revalidate the courts page
    revalidatePath(`/tournaments/${tournamentId}/courts`)

    return { data: court }
  } catch (error) {
    console.error("Error in createCourt:", error)
    return { error: "Failed to create court" }
  }
}

export async function updateCourt(courtId: string, data: CourtFormData) {
  try {
    // Validate input
    const validatedData = courtSchema.parse(data)

    const supabase = await createClient()

    // Get tournament_id for revalidation
    const { data: court } = await supabase
      .from(TABLE_NAMES.COURTS)
      .select("tournament_id")
      .eq("id", courtId)
      .single()

    if (!court) {
      return { error: "Court not found" }
    }

    // Update court
    const { data: updatedCourt, error } = await supabase
      .from(TABLE_NAMES.COURTS)
      .update({
        name: validatedData.name,
        is_active: validatedData.is_active,
      })
      .eq("id", courtId)
      .select()
      .single()

    if (error) {
      console.error("Error updating court:", error)
      return { error: error.message }
    }

    // Revalidate the courts page
    revalidatePath(`/tournaments/${court.tournament_id}/courts`)

    return { data: updatedCourt }
  } catch (error) {
    console.error("Error in updateCourt:", error)
    return { error: "Failed to update court" }
  }
}

export async function deleteCourt(courtId: string) {
  try {
    const supabase = await createClient()

    // Get tournament_id for revalidation
    const { data: court } = await supabase
      .from(TABLE_NAMES.COURTS)
      .select("tournament_id")
      .eq("id", courtId)
      .single()

    if (!court) {
      return { error: "Court not found" }
    }

    // Delete court
    const { error } = await supabase
      .from(TABLE_NAMES.COURTS)
      .delete()
      .eq("id", courtId)

    if (error) {
      console.error("Error deleting court:", error)
      return { error: error.message }
    }

    // Revalidate the courts page
    revalidatePath(`/tournaments/${court.tournament_id}/courts`)

    return { success: true }
  } catch (error) {
    console.error("Error in deleteCourt:", error)
    return { error: "Failed to delete court" }
  }
}
