"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  COMPETITION_ACTIVE_ENTRY_STATUSES,
  getSwissRepairWindowStatus,
  withExcludedMatchIds,
  withLateAdd,
  withoutLateAdd,
} from "@/lib/services/swiss-repair"
import { TABLE_NAMES } from "@/types/database"

type DivisionMutationContext = {
  id: string
  tournament_id: string
  draw_size: number
  play_mode: string
  format: string
  is_published?: boolean
}

async function revalidateDivisionPaths(tournamentId: string, divisionId: string) {
  revalidatePath(`/tournaments/${tournamentId}/divisions`)
  revalidatePath(`/tournaments/${tournamentId}/divisions/${divisionId}/entries`)
  revalidatePath(`/tournaments/${tournamentId}/divisions/${divisionId}/matches`)
  revalidatePath(`/tournaments/${tournamentId}/control-center`)
  revalidatePath(`/live/${tournamentId}`)
}

async function getDivisionContext(
  divisionId: string
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; division?: DivisionMutationContext; error?: string }> {
  const supabase = await createClient()
  const { data: division } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id, tournament_id, draw_size, play_mode, format, is_published")
    .eq("id", divisionId)
    .single()

  if (!division) {
    return { supabase, error: "Division not found" }
  }

  return { supabase, division: division as DivisionMutationContext }
}

async function getCompetitionEntryCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  divisionId: string
) {
  const { count } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select("*", { count: "exact", head: true })
    .eq("division_id", divisionId)
    .in("status", COMPETITION_ACTIVE_ENTRY_STATUSES)

  return count ?? 0
}

async function getSwissRepairContext(
  divisionId: string
): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  division?: DivisionMutationContext
  draw?: { id: string; state_json: any }
  matches?: any[]
  error?: string
}> {
  const { supabase, division, error } = await getDivisionContext(divisionId)
  if (error || !division) {
    return { supabase, error: error || "Division not found" }
  }

  if (division.format !== "swiss") {
    return { supabase, error: "Swiss repair is only available for Swiss divisions" }
  }

  const { data: draw } = await supabase
    .from(TABLE_NAMES.DRAWS)
    .select("id, state_json")
    .eq("division_id", divisionId)
    .single()

  if (!draw) {
    return { supabase, error: "Generate the Swiss draw first." }
  }

  const { data: matches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select("id, round, status, phase, side_a_entry_id, side_b_entry_id")
    .eq("division_id", divisionId)

  const repairWindow = getSwissRepairWindowStatus(matches || [], draw.state_json)
  if (!repairWindow.available) {
    return { supabase, error: repairWindow.reason || "Swiss repair is not available right now." }
  }

  return { supabase, division, draw, matches: matches || [] }
}

export async function createEntry(
  divisionId: string,
  participantId: string,
  seed: number | null
) {
  try {
    const { supabase, division, error: divisionError } = await getDivisionContext(divisionId)
    if (divisionError || !division) {
      return { error: divisionError || "Division not found" }
    }

    const { data: existingEntry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select("id")
      .eq("division_id", divisionId)
      .eq("participant_id", participantId)
      .maybeSingle()

    if (existingEntry) {
      return { error: "Participant is already in this division" }
    }

    const count = await getCompetitionEntryCount(supabase, divisionId)
    if (count >= division.draw_size) {
      return { error: "Division is full" }
    }

    if (seed !== null) {
      const { data: seedTaken } = await supabase
        .from(TABLE_NAMES.ENTRIES)
        .select("id")
        .eq("division_id", divisionId)
        .eq("seed", seed)
        .maybeSingle()

      if (seedTaken) {
        return { error: `Seed ${seed} is already taken` }
      }
    }

    const { data: entry, error } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .insert({
        division_id: divisionId,
        participant_id: participantId,
        seed,
        status: "active",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating entry:", error)
      return { error: error.message }
    }

    await revalidateDivisionPaths(division.tournament_id, divisionId)
    return { data: entry }
  } catch (error) {
    console.error("Error in createEntry:", error)
    return { error: "Failed to create entry" }
  }
}

export async function createDoubleEntry(
  divisionId: string,
  participantId1: string,
  participantId2: string,
  seed: number | null
) {
  try {
    const { supabase, division, error: divisionError } = await getDivisionContext(divisionId)
    if (divisionError || !division) {
      return { error: divisionError || "Division not found" }
    }

    if (division.play_mode !== "doubles") {
      return { error: "Division is not a doubles division" }
    }

    if (participantId1 === participantId2) {
      return { error: "A team must consist of two different participants" }
    }

    const count = await getCompetitionEntryCount(supabase, divisionId)
    if (count >= division.draw_size) {
      return { error: "Division is full" }
    }

    const { data: existingMembers } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select(`
        participant_id,
        team:bracket_blaze_teams!inner(division_id)
      `)
      .eq("team.division_id", divisionId)
      .in("participant_id", [participantId1, participantId2])

    if (existingMembers && existingMembers.length > 0) {
      return { error: "One or both participants are already in a team in this division" }
    }

    const { data: participants } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("id, display_name")
      .in("id", [participantId1, participantId2])

    if (!participants || participants.length !== 2) {
      return { error: "Could not find both participants" }
    }

    const name1 = participants.find((participant) => participant.id === participantId1)?.display_name
    const name2 = participants.find((participant) => participant.id === participantId2)?.display_name
    const teamName = `${name1} / ${name2}`

    if (seed !== null) {
      const { data: seedTaken } = await supabase
        .from(TABLE_NAMES.ENTRIES)
        .select("id")
        .eq("division_id", divisionId)
        .eq("seed", seed)
        .maybeSingle()

      if (seedTaken) {
        return { error: `Seed ${seed} is already taken` }
      }
    }

    const { data: team, error: teamError } = await supabase
      .from(TABLE_NAMES.TEAMS)
      .insert({
        division_id: divisionId,
        name: teamName,
      })
      .select()
      .single()

    if (teamError || !team) {
      console.error("Error creating team:", teamError)
      return { error: teamError?.message || "Failed to create team" }
    }

    const { error: membersError } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .insert([
        { team_id: team.id, participant_id: participantId1 },
        { team_id: team.id, participant_id: participantId2 },
      ])

    if (membersError) {
      await supabase.from(TABLE_NAMES.TEAMS).delete().eq("id", team.id)
      console.error("Error creating team members:", membersError)
      return { error: membersError.message }
    }

    const { data: entry, error: entryError } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .insert({
        division_id: divisionId,
        team_id: team.id,
        seed,
        status: "active",
      })
      .select()
      .single()

    if (entryError) {
      await supabase.from(TABLE_NAMES.TEAM_MEMBERS).delete().eq("team_id", team.id)
      await supabase.from(TABLE_NAMES.TEAMS).delete().eq("id", team.id)
      console.error("Error creating entry:", entryError)
      return { error: entryError.message }
    }

    await revalidateDivisionPaths(division.tournament_id, divisionId)
    return { data: entry }
  } catch (error) {
    console.error("Error in createDoubleEntry:", error)
    return { error: "Failed to create doubles entry" }
  }
}

export async function createLateAddEntry(divisionId: string, participantId: string) {
  try {
    const { supabase, division, draw, error } = await getSwissRepairContext(divisionId)
    if (error || !division || !draw) {
      return { error: error || "Swiss repair is not available right now." }
    }

    if (division.play_mode !== "singles") {
      return { error: "Use the doubles late-add flow for doubles divisions" }
    }

    const { data: existingEntry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select("id")
      .eq("division_id", divisionId)
      .eq("participant_id", participantId)
      .maybeSingle()

    if (existingEntry) {
      return { error: "Participant is already in this division" }
    }

    const count = await getCompetitionEntryCount(supabase, divisionId)
    if (count >= division.draw_size) {
      return { error: "Division is full" }
    }

    const { data: entry, error: insertError } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .insert({
        division_id: divisionId,
        participant_id: participantId,
        seed: null,
        status: "late_add",
      })
      .select()
      .single()

    if (insertError || !entry) {
      console.error("Error creating late add entry:", insertError)
      return { error: insertError?.message || "Failed to create late add" }
    }

    const nextDrawState = withLateAdd(draw.state_json, entry.id)
    const { error: drawUpdateError } = await supabase
      .from(TABLE_NAMES.DRAWS)
      .update({ state_json: nextDrawState })
      .eq("id", draw.id)

    if (drawUpdateError) {
      await supabase.from(TABLE_NAMES.ENTRIES).delete().eq("id", entry.id)
      return { error: drawUpdateError.message }
    }

    await revalidateDivisionPaths(division.tournament_id, divisionId)
    return { data: entry }
  } catch (error) {
    console.error("Error in createLateAddEntry:", error)
    return { error: "Failed to create late add entry" }
  }
}

export async function createLateAddDoubleEntry(
  divisionId: string,
  participantId1: string,
  participantId2: string
) {
  try {
    const { supabase, division, draw, error } = await getSwissRepairContext(divisionId)
    if (error || !division || !draw) {
      return { error: error || "Swiss repair is not available right now." }
    }

    if (division.play_mode !== "doubles") {
      return { error: "Use the singles late-add flow for singles divisions" }
    }

    if (participantId1 === participantId2) {
      return { error: "A team must consist of two different participants" }
    }

    const count = await getCompetitionEntryCount(supabase, divisionId)
    if (count >= division.draw_size) {
      return { error: "Division is full" }
    }

    const { data: existingMembers } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .select(`
        participant_id,
        team:bracket_blaze_teams!inner(division_id)
      `)
      .eq("team.division_id", divisionId)
      .in("participant_id", [participantId1, participantId2])

    if (existingMembers && existingMembers.length > 0) {
      return { error: "One or both participants are already in a team in this division" }
    }

    const { data: participants } = await supabase
      .from(TABLE_NAMES.PARTICIPANTS)
      .select("id, display_name")
      .in("id", [participantId1, participantId2])

    if (!participants || participants.length !== 2) {
      return { error: "Could not find both participants" }
    }

    const name1 = participants.find((participant) => participant.id === participantId1)?.display_name
    const name2 = participants.find((participant) => participant.id === participantId2)?.display_name
    const teamName = `${name1} / ${name2}`

    const { data: team, error: teamError } = await supabase
      .from(TABLE_NAMES.TEAMS)
      .insert({
        division_id: divisionId,
        name: teamName,
      })
      .select()
      .single()

    if (teamError || !team) {
      console.error("Error creating late add team:", teamError)
      return { error: teamError?.message || "Failed to create team" }
    }

    const { error: membersError } = await supabase
      .from(TABLE_NAMES.TEAM_MEMBERS)
      .insert([
        { team_id: team.id, participant_id: participantId1 },
        { team_id: team.id, participant_id: participantId2 },
      ])

    if (membersError) {
      await supabase.from(TABLE_NAMES.TEAMS).delete().eq("id", team.id)
      return { error: membersError.message }
    }

    const { data: entry, error: entryError } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .insert({
        division_id: divisionId,
        team_id: team.id,
        seed: null,
        status: "late_add",
      })
      .select()
      .single()

    if (entryError || !entry) {
      await supabase.from(TABLE_NAMES.TEAM_MEMBERS).delete().eq("team_id", team.id)
      await supabase.from(TABLE_NAMES.TEAMS).delete().eq("id", team.id)
      console.error("Error creating late add entry:", entryError)
      return { error: entryError?.message || "Failed to create late add entry" }
    }

    const nextDrawState = withLateAdd(draw.state_json, entry.id)
    const { error: drawUpdateError } = await supabase
      .from(TABLE_NAMES.DRAWS)
      .update({ state_json: nextDrawState })
      .eq("id", draw.id)

    if (drawUpdateError) {
      await supabase.from(TABLE_NAMES.ENTRIES).delete().eq("id", entry.id)
      await supabase.from(TABLE_NAMES.TEAM_MEMBERS).delete().eq("team_id", team.id)
      await supabase.from(TABLE_NAMES.TEAMS).delete().eq("id", team.id)
      return { error: drawUpdateError.message }
    }

    await revalidateDivisionPaths(division.tournament_id, divisionId)
    return { data: entry }
  } catch (error) {
    console.error("Error in createLateAddDoubleEntry:", error)
    return { error: "Failed to create doubles late add" }
  }
}

export async function updateEntry(entryId: string, seed: number | null) {
  try {
    const supabase = await createClient()
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

    if (seed !== null) {
      const { data: seedTaken } = await supabase
        .from(TABLE_NAMES.ENTRIES)
        .select("id")
        .eq("division_id", entry.division_id)
        .eq("seed", seed)
        .neq("id", entryId)
        .maybeSingle()

      if (seedTaken) {
        return { error: `Seed ${seed} is already taken` }
      }
    }

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

    const tournamentId = (entry.division as any).tournament_id
    await revalidateDivisionPaths(tournamentId, entry.division_id)
    return { data: updatedEntry }
  } catch (error) {
    console.error("Error in updateEntry:", error)
    return { error: "Failed to update entry" }
  }
}

export async function revokeEntry(entryId: string) {
  try {
    const supabase = await createClient()
    const { data: entry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select(`
        id,
        division_id,
        participant_id,
        team_id,
        status,
        division:bracket_blaze_divisions(id, tournament_id, format)
      `)
      .eq("id", entryId)
      .single()

    if (!entry) {
      return { error: "Entry not found" }
    }

    if (entry.status === "withdrawn") {
      return { error: "Entry is already withdrawn" }
    }

    const { division, draw, matches, error } = await getSwissRepairContext(entry.division_id)
    if (error || !division || !draw || !matches) {
      return { error: error || "Swiss repair is not available right now." }
    }

    const round1MatchIds = matches
      .filter((match) =>
        match.phase === "swiss" &&
        match.round === 1 &&
        (match.side_a_entry_id === entryId || match.side_b_entry_id === entryId)
      )
      .map((match) => match.id)

    let nextDrawState = draw.state_json
    if (round1MatchIds.length > 0) {
      nextDrawState = withExcludedMatchIds(nextDrawState, round1MatchIds)
    }

    if (entry.status === "late_add") {
      nextDrawState = withoutLateAdd(nextDrawState, entryId)
    }

    const { error: updateError } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .update({ status: "withdrawn" })
      .eq("id", entryId)

    if (updateError) {
      return { error: updateError.message }
    }

    const { error: drawUpdateError } = await supabase
      .from(TABLE_NAMES.DRAWS)
      .update({ state_json: nextDrawState })
      .eq("id", draw.id)

    if (drawUpdateError) {
      await supabase.from(TABLE_NAMES.ENTRIES).update({ status: entry.status }).eq("id", entryId)
      return { error: drawUpdateError.message }
    }

    await revalidateDivisionPaths(division.tournament_id, entry.division_id)
    return { success: true }
  } catch (error) {
    console.error("Error in revokeEntry:", error)
    return { error: "Failed to revoke entry" }
  }
}

export async function deleteEntry(entryId: string) {
  try {
    const supabase = await createClient()
    const { data: entry } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .select(`
        division_id,
        division:bracket_blaze_divisions(tournament_id, is_published)
      `)
      .eq("id", entryId)
      .single()

    if (!entry) {
      return { error: "Entry not found" }
    }

    if ((entry.division as any).is_published) {
      return { error: "Cannot remove entry after draw generation. Revoke the entry instead." }
    }

    const { error } = await supabase
      .from(TABLE_NAMES.ENTRIES)
      .delete()
      .eq("id", entryId)

    if (error) {
      console.error("Error deleting entry:", error)
      return { error: error.message }
    }

    const tournamentId = (entry.division as any).tournament_id
    await revalidateDivisionPaths(tournamentId, entry.division_id)
    return { success: true }
  } catch (error) {
    console.error("Error in deleteEntry:", error)
    return { error: "Failed to delete entry" }
  }
}
