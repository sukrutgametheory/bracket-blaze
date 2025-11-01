"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { tournamentSchema, type TournamentFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES } from "@/types/database"

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
