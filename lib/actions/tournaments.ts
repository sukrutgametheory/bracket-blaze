"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { tournamentSchema, type TournamentFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES } from "@/types/database"
import { requireAuth } from "@/lib/auth/require-auth"

export async function createTournament(data: TournamentFormData, userId: string) {
  try {
    // Validate input
    const validatedData = tournamentSchema.parse(data)

    const supabase = await createClient()

    // Insert tournament
    const { data: tournament, error } = await supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .insert({
        name: validatedData.name,
        venue: validatedData.venue,
        timezone: validatedData.timezone,
        rest_window_minutes: validatedData.rest_window_minutes,
        status: "draft",
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating tournament:", error)
      return { error: error.message }
    }

    // Revalidate the tournaments list
    revalidatePath("/tournaments")

    return { data: tournament }
  } catch (error) {
    console.error("Error in createTournament:", error)
    return { error: "Failed to create tournament" }
  }
}

/**
 * Toggle registration_open for a tournament.
 * Only the tournament creator can toggle this.
 */
export async function toggleRegistration(tournamentId: string, open: boolean) {
  try {
    const auth = await requireAuth()
    if (!auth) return { error: "Unauthorized" }
    const { supabase, user } = auth

    // Verify user owns this tournament
    const { data: tournament } = await supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .select("id, created_by")
      .eq("id", tournamentId)
      .single()

    if (!tournament) {
      return { error: "Tournament not found" }
    }

    if (tournament.created_by !== user.id) {
      return { error: "Not authorized for this tournament" }
    }

    const { error } = await supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .update({ registration_open: open })
      .eq("id", tournamentId)

    if (error) {
      return { error: error.message }
    }

    revalidatePath(`/tournaments/${tournamentId}/control-center`)

    return { success: true }
  } catch (error) {
    console.error("Error in toggleRegistration:", error)
    return { error: "Failed to toggle registration" }
  }
}
