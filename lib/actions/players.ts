"use server"

import { createClient } from "@/lib/supabase/server"
import { TABLE_NAMES, type Player } from "@/types/database"
import { normalizePhone, isValidE164 } from "@/lib/utils/phone"

export async function findPlayerByPhone(rawPhone: string): Promise<{ data: Player | null; error?: string }> {
  try {
    const phone = normalizePhone(rawPhone)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from(TABLE_NAMES.PLAYERS)
      .select("*")
      .eq("phone", phone)
      .maybeSingle()

    if (error) {
      console.error("Error finding player:", error)
      return { data: null, error: error.message }
    }

    return { data: data as Player | null }
  } catch (error) {
    console.error("Error in findPlayerByPhone:", error)
    return { data: null, error: "Failed to search for player" }
  }
}

export async function findOrCreatePlayer(
  rawPhone: string,
  displayName: string,
  email: string | null,
  club: string | null
): Promise<{ data: string | null; error?: string }> {
  try {
    const phone = normalizePhone(rawPhone)
    if (!isValidE164(phone)) {
      return { data: null, error: "Invalid phone number format" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .rpc("bracket_blaze_find_or_create_player", {
        p_phone: phone,
        p_display_name: displayName,
        p_email: email,
        p_club: club,
      })

    if (error) {
      console.error("Error in findOrCreatePlayer:", error)
      return { data: null, error: error.message }
    }

    return { data: data as string }
  } catch (error) {
    console.error("Error in findOrCreatePlayer:", error)
    return { data: null, error: "Failed to create player record" }
  }
}
