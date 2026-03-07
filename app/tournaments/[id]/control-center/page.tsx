import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import { TABLE_NAMES, type ControlCenterMatch, type Tournament } from "@/types/database"
import { ControlCenterClient } from "@/components/control-center/control-center-client"
import { getPersistedStandings, type RankedStanding } from "@/lib/services/standings-engine"
import { sortByNaturalName } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface ControlCenterPageProps {
  params: Promise<{ id: string }>
}

export default async function ControlCenterPage({ params }: ControlCenterPageProps) {
  const { id } = await params
  const supabase = createAdminClient()

  const [
    { data: tournament, error: tournamentError },
    { data: courts },
    { data: divisions },
  ] = await Promise.all([
    supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from(TABLE_NAMES.COURTS)
      .select("*")
      .eq("tournament_id", id)
      .eq("is_active", true),
    supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("*")
      .eq("tournament_id", id)
      .eq("is_published", true)
      .order("scheduling_priority", { ascending: false }),
  ])

  if (tournamentError || !tournament) {
    notFound()
  }

  const typedTournament = tournament as Tournament

  const divisionIds = divisions?.map(d => d.id) || []

  const [
    { data: matches },
    { data: draws },
    { data: entriesWithParticipants },
  ] = divisionIds.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase
          .from(TABLE_NAMES.MATCHES)
          .select(`
            *,
            division:bracket_blaze_divisions!inner(
              id,
              name,
              format,
              scheduling_priority
            ),
            side_a:bracket_blaze_entries!side_a_entry_id(
              id,
              seed,
              participant:bracket_blaze_participants(id, display_name, club),
              team:bracket_blaze_teams(name)
            ),
            side_b:bracket_blaze_entries!side_b_entry_id(
              id,
              seed,
              participant:bracket_blaze_participants(id, display_name, club),
              team:bracket_blaze_teams(name)
            )
          `)
          .in("division_id", divisionIds)
          .order("round", { ascending: true })
          .order("sequence", { ascending: true }),
        supabase
          .from(TABLE_NAMES.DRAWS)
          .select("division_id, state_json")
          .in("division_id", divisionIds),
        supabase
          .from(TABLE_NAMES.ENTRIES)
          .select("id, seed, participant:bracket_blaze_participants(display_name, club), team:bracket_blaze_teams(name)")
          .in("division_id", divisionIds),
      ])

  const standingsMap: Record<string, RankedStanding[]> = {}
  const standingsResults = await Promise.all(
    (divisions || []).map(async (division) => {
      const drawState = draws?.find(d => d.division_id === division.id)?.state_json as any
      const currentRound = drawState?.current_round || 1
      const { standings } = await getPersistedStandings(division.id, currentRound, supabase)
      return [division.id, standings || []] as const
    })
  )
  for (const [divisionId, standings] of standingsResults) {
    standingsMap[divisionId] = standings
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Control Center
        </h1>
        <p className="text-muted-foreground">{typedTournament.name}</p>
      </div>

      <ControlCenterClient
        tournament={typedTournament}
        courts={sortByNaturalName(courts || [])}
        divisions={divisions || []}
        matches={(matches || []) as ControlCenterMatch[]}
        draws={draws || []}
        standings={standingsMap}
        entries={entriesWithParticipants || []}
      />
    </div>
  )
}
