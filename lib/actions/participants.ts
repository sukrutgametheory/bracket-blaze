"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { participantSchema, type ParticipantFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES } from "@/types/database"

export async function createParticipant(data: ParticipantFormData, tournamentId: string) {
  try {
    // Validate input
    const validatedData = participantSchema.parse(data)

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

    // Insert participant
    const { data: participant, error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .insert({
        display_name: validatedData.display_name,
        club: validatedData.club || null,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        tournament_id: tournamentId,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating participant:", error)
      return { error: error.message }
    }

    // Revalidate the participants page
    revalidatePath(`/tournaments/${tournamentId}/participants`)

    return { data: participant }
  } catch (error) {
    console.error("Error in createParticipant:", error)
    return { error: "Failed to create participant" }
  }
}

export async function updateParticipant(participantId: string, data: ParticipantFormData) {
  try {
    // Validate input
    const validatedData = participantSchema.parse(data)

    const supabase = await createClient()

    // Get tournament_id for revalidation
    const { data: participant } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("tournament_id")
      .eq("id", participantId)
      .single()

    if (!participant) {
      return { error: "Participant not found" }
    }

    // Update participant
    const { data: updatedParticipant, error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .update({
        display_name: validatedData.display_name,
        club: validatedData.club || null,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
      })
      .eq("id", participantId)
      .select()
      .single()

    if (error) {
      console.error("Error updating participant:", error)
      return { error: error.message }
    }

    // Revalidate the participants page
    revalidatePath(`/tournaments/${participant.tournament_id}/participants`)

    return { data: updatedParticipant }
  } catch (error) {
    console.error("Error in updateParticipant:", error)
    return { error: "Failed to update participant" }
  }
}

export async function deleteParticipant(participantId: string) {
  try {
    const supabase = await createClient()

    // Get tournament_id for revalidation
    const { data: participant } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("tournament_id")
      .eq("id", participantId)
      .single()

    if (!participant) {
      return { error: "Participant not found" }
    }

    // Delete participant (cascades to entries via foreign key)
    const { error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .delete()
      .eq("id", participantId)

    if (error) {
      console.error("Error deleting participant:", error)
      return { error: error.message }
    }

    // Revalidate the participants page
    revalidatePath(`/tournaments/${participant.tournament_id}/participants`)

    return { success: true }
  } catch (error) {
    console.error("Error in deleteParticipant:", error)
    return { error: "Failed to delete participant" }
  }
}
