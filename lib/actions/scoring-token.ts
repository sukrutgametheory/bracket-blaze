"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES } from "@/types/database"
import { requireAuth } from "@/lib/auth/require-auth"

/**
 * Generate (or regenerate) a scoring token for a tournament.
 * Regenerating overwrites the old token, invalidating any existing scoring links.
 */
export async function generateScoringToken(tournamentId: string) {
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

    // Generate a new UUID token
    const token = crypto.randomUUID()

    const { error } = await supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .update({ scoring_token: token })
      .eq("id", tournamentId)

    if (error) {
      return { error: error.message }
    }

    revalidatePath(`/tournaments/${tournamentId}/control-center`)

    return { success: true, token }
  } catch (error) {
    console.error("Error in generateScoringToken:", error)
    return { error: "Failed to generate scoring token" }
  }
}
