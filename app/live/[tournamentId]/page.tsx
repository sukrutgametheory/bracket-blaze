import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { TABLE_NAMES } from "@/types/database"
import { calculateStandings, type RankedStanding } from "@/lib/services/standings-engine"
import { LivePortalClient } from "@/components/live-portal/live-portal-client"

interface LivePortalPageProps {
  params: Promise<{ tournamentId: string }>
}

export default async function LivePortalPage({ params }: LivePortalPageProps) {
  const { tournamentId } = await params
  const supabase = await createClient()

  // Fetch tournament (public — no auth required)
  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("id, name, status")
    .eq("id", tournamentId)
    .eq("status", "active")
    .single()

  if (!tournament) {
    notFound()
  }

  // Fetch published divisions
  const { data: divisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("is_published", true)
    .order("scheduling_priority", { ascending: false })

  const divisionIds = divisions?.map(d => d.id) || []

  // Fetch live + completed matches with player/court details
  const { data: matches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      id, status, court_id, meta_json, round, sequence, phase,
      winner_side, actual_start_time, actual_end_time, division_id,
      division:bracket_blaze_divisions!inner(id, name, format),
      court:bracket_blaze_courts(id, name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        id, seed,
        participant:bracket_blaze_participants(display_name, club),
        team:bracket_blaze_teams(name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        id, seed,
        participant:bracket_blaze_participants(display_name, club),
        team:bracket_blaze_teams(name)
      )
    `)
    .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])
    .in("status", ["on_court", "completed", "walkover"])
    .order("round", { ascending: true })
    .order("sequence", { ascending: true })

  // Fetch draw state for standings context
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
  const { data: entries } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select("id, seed, participant:bracket_blaze_participants(display_name, club), team:bracket_blaze_teams(name)")
    .in("division_id", divisionIds.length > 0 ? divisionIds : ['none'])

  return (
    <LivePortalClient
      tournamentName={tournament.name}
      divisions={divisions || []}
      matches={matches || []}
      draws={draws || []}
      standings={standingsMap}
      entries={entries || []}
      divisionIds={divisionIds}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
