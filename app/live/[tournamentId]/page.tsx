import { createAdminClient } from "@/lib/supabase/admin"
import { notFound } from "next/navigation"
import { TABLE_NAMES, type MatchStory } from "@/types/database"
import { getPersistedStandings, type RankedStanding } from "@/lib/services/standings-engine"
import { LivePortalClient } from "@/components/live-portal/live-portal-client"

interface LivePortalPageProps {
  params: Promise<{ tournamentId: string }>
}

export default async function LivePortalPage({ params }: LivePortalPageProps) {
  const { tournamentId } = await params
  const supabase = createAdminClient()

  const [
    { data: tournament },
    { data: divisions },
  ] = await Promise.all([
    supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .select("id, name, status")
      .eq("id", tournamentId)
      .eq("status", "active")
      .single(),
    supabase
      .from(TABLE_NAMES.DIVISIONS)
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("is_published", true)
      .order("scheduling_priority", { ascending: false }),
  ])

  if (!tournament) {
    notFound()
  }

  const divisionIds = divisions?.map(d => d.id) || []

  const [
    { data: matches },
    { data: draws },
    { data: entries },
  ] = divisionIds.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase
          .from(TABLE_NAMES.MATCHES)
          .select(`
            id, status, court_id, meta_json, round, sequence, phase,
            winner_side, actual_start_time, actual_end_time, division_id,
            division:bracket_blaze_divisions!inner(id, name, format),
            court:bracket_blaze_courts!bracket_blaze_matches_court_id_fkey(id, name),
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
          .in("division_id", divisionIds)
          .in("status", ["on_court", "completed", "walkover"])
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

  const matchIds = matches?.map(match => match.id) || []
  const liveCourtIds = Array.from(new Set(
    (matches || [])
      .filter(match => match.status === "on_court" && match.court_id)
      .map(match => match.court_id as string)
  ))

  const { data: queuedMatches } = liveCourtIds.length === 0
    ? { data: [] }
    : await supabase
        .from(TABLE_NAMES.MATCHES)
        .select(`
          id, status, queued_court_id, round, sequence, phase, division_id,
          division:bracket_blaze_divisions!inner(id, name, format),
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
        .in("queued_court_id", liveCourtIds)
        .eq("status", "scheduled")

  const { data: stories } = matchIds.length === 0
    ? { data: [] as MatchStory[] }
    : await supabase
        .from(TABLE_NAMES.MATCH_STORIES)
        .select("id, match_id, story_type, status, version, model_slug, prompt_version, content, context_json, error_code, error_message, generated_at, invalidated_at, created_at, updated_at")
        .in("match_id", matchIds)

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
    <LivePortalClient
      tournamentName={tournament.name}
      divisions={divisions || []}
      matches={matches || []}
      queuedMatches={queuedMatches || []}
      stories={stories || []}
      draws={draws || []}
      standings={standingsMap}
      entries={entries || []}
      divisionIds={divisionIds}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
