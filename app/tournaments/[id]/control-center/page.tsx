import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament } from "@/types/database"
import { ControlCenterClient } from "@/components/control-center/control-center-client"
import { calculateStandings, type RankedStanding } from "@/lib/services/standings-engine"

interface ControlCenterPageProps {
  params: Promise<{ id: string }>
}

export default async function ControlCenterPage({ params }: ControlCenterPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch tournament
  const { data: tournament, error: tournamentError } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("*")
    .eq("id", id)
    .single()

  if (tournamentError || !tournament) {
    notFound()
  }

  const typedTournament = tournament as Tournament

  // Fetch active courts
  const { data: courts } = await supabase
    .from(TABLE_NAMES.COURTS)
    .select("*")
    .eq("tournament_id", id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  // Fetch divisions with published draws
  const { data: divisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("*")
    .eq("tournament_id", id)
    .eq("is_published", true)
    .order("scheduling_priority", { ascending: false })

  const divisionIds = divisions?.map(d => d.id) || []

  // Fetch all matches for published divisions with entry/participant details
  const { data: matches } = await supabase
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
        participant:bracket_blaze_participants(id, display_name, club)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        id,
        seed,
        participant:bracket_blaze_participants(id, display_name, club)
      )
    `)
    .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])
    .order("round", { ascending: true })
    .order("sequence", { ascending: true })

  // Fetch draw state for each division
  const { data: draws } = await supabase
    .from(TABLE_NAMES.DRAWS)
    .select("division_id, state_json")
    .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])

  // Calculate standings per division
  const standingsMap: Record<string, RankedStanding[]> = {}
  for (const division of divisions || []) {
    const drawState = draws?.find(d => d.division_id === division.id)?.state_json as any
    const currentRound = drawState?.current_round || 1
    const { standings } = await calculateStandings(division.id, currentRound)
    standingsMap[division.id] = standings || []
  }

  // Fetch entries with participant names for standings display
  const { data: entriesWithParticipants } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select("id, seed, participant:bracket_blaze_participants(display_name, club)")
    .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])

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
        courts={courts || []}
        divisions={divisions || []}
        matches={matches || []}
        draws={draws || []}
        standings={standingsMap}
        entries={entriesWithParticipants || []}
      />
    </div>
  )
}
