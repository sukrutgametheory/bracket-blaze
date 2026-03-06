import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { TABLE_NAMES } from "@/types/database"
import { SingleCourtTvClient } from "@/components/court-tv/single-court-tv-client"

interface SingleCourtTvPageProps {
  params: Promise<{ tournamentId: string }>
}

export default async function SingleCourtTvPage({ params }: SingleCourtTvPageProps) {
  const { tournamentId } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("id, name, status")
    .eq("id", tournamentId)
    .eq("status", "active")
    .single()

  if (!tournament) {
    notFound()
  }

  const { data: courts } = await supabase
    .from(TABLE_NAMES.COURTS)
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: divisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("is_published", true)

  const divisionIds = divisions?.map(division => division.id) || []

  const { data: matches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      id, division_id, status, court_id, meta_json, round, sequence, phase,
      division:bracket_blaze_divisions!inner(id, name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant:bracket_blaze_participants(display_name),
        team:bracket_blaze_teams(name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant:bracket_blaze_participants(display_name),
        team:bracket_blaze_teams(name)
      )
    `)
    .in("court_id", (courts || []).map(court => court.id))
    .in("status", ["ready", "on_court", "pending_signoff", "completed"])

  return (
    <SingleCourtTvClient
      tournamentId={tournament.id}
      tournamentName={tournament.name}
      courts={courts || []}
      divisionIds={divisionIds}
      initialMatches={matches || []}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
