"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { participantSchema, updateParticipantSchema, type ParticipantFormData, type UpdateParticipantFormData } from "@/lib/validations/tournament"
import { TABLE_NAMES, type Participant } from "@/types/database"
import { findOrCreatePlayer } from "@/lib/actions/players"
import { normalizePhone, isValidE164 } from "@/lib/utils/phone"

export async function createParticipant(data: ParticipantFormData, tournamentId: string) {
  try {
    // Validate input (phone is normalized by the schema transform)
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

    // Find or create global player (atomic, handles concurrency)
    const { data: playerId, error: playerError } = await findOrCreatePlayer(
      validatedData.phone,
      validatedData.display_name,
      validatedData.email || null,
      validatedData.club || null
    )

    if (playerError || !playerId) {
      return { error: playerError || "Failed to create player record" }
    }

    // Insert participant linked to global player
    const { data: participant, error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .insert({
        display_name: validatedData.display_name,
        club: validatedData.club || null,
        email: validatedData.email || null,
        phone: validatedData.phone,
        player_id: playerId,
        tournament_id: tournamentId,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating participant:", error)
      // Handle duplicate player in same tournament
      if (error.code === "23505" && error.message.includes("tournament_player")) {
        return { error: "This player is already in this tournament" }
      }
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

// Update participant details (phone is immutable — not included in updates)
export async function updateParticipant(participantId: string, data: UpdateParticipantFormData) {
  try {
    const validatedData = updateParticipantSchema.parse(data)
    const supabase = await createClient()

    // Get tournament_id and player_id for revalidation and global update
    const { data: participant } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("tournament_id, player_id")
      .eq("id", participantId)
      .single()

    if (!participant) {
      return { error: "Participant not found" }
    }

    // Update participant (phone excluded — immutable after creation)
    const { data: updatedParticipant, error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .update({
        display_name: validatedData.display_name,
        club: validatedData.club || null,
        email: validatedData.email || null,
      })
      .eq("id", participantId)
      .select()
      .single()

    if (error) {
      console.error("Error updating participant:", error)
      return { error: error.message }
    }

    // Last-write-wins: also update the global player record
    if (participant.player_id) {
      await supabase
        .from(TABLE_NAMES.PLAYERS)
        .update({
          display_name: validatedData.display_name,
          club: validatedData.club || null,
          email: validatedData.email || null,
        })
        .eq("id", participant.player_id)
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

export async function getUnlinkedParticipants(tournamentId: string): Promise<Participant[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from(TABLE_NAMES.PARTICIPANTS)
    .select("*")
    .eq("tournament_id", tournamentId)
    .is("player_id", null)
    .order("display_name", { ascending: true })

  return (data as Participant[]) || []
}

// Link an existing participant to a global player by phone (used by backfill modal)
export async function linkParticipantToPlayer(
  participantId: string,
  rawPhone: string,
  displayName: string,
  email: string | null,
  club: string | null
) {
  try {
    const phone = normalizePhone(rawPhone)
    if (!isValidE164(phone)) {
      return { error: "Invalid phone number format" }
    }
    const supabase = await createClient()

    // Find or create the global player
    const { data: playerId, error: playerError } = await findOrCreatePlayer(
      phone,
      displayName,
      email,
      club
    )

    if (playerError || !playerId) {
      return { error: playerError || "Failed to create player record" }
    }

    // Update participant with player_id and normalized phone
    const { error } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .update({ player_id: playerId, phone })
      .eq("id", participantId)

    if (error) {
      console.error("Error linking participant:", error)
      if (error.code === "23505") {
        return { error: "This player is already in this tournament" }
      }
      return { error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in linkParticipantToPlayer:", error)
    return { error: "Failed to link participant" }
  }
}
