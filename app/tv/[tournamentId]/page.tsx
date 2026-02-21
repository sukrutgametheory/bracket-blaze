import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { TABLE_NAMES } from "@/types/database"
import { CourtTvClient } from "@/components/court-tv/court-tv-client"

interface CourtTvPageProps {
  params: Promise<{ tournamentId: string }>
}

export default async function CourtTvPage({ params }: CourtTvPageProps) {
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

  // Fetch active courts
  const { data: courts } = await supabase
    .from(TABLE_NAMES.COURTS)
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  // Get division IDs for this tournament (for Realtime filter)
  const { data: divisions } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("is_published", true)

  const divisionIds = divisions?.map(d => d.id) || []

  // Fetch matches assigned to courts with player details
  const { data: matches } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      id, status, court_id, meta_json, round, sequence, phase,
      division:bracket_blaze_divisions!inner(id, name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        participant:bracket_blaze_participants(display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        participant:bracket_blaze_participants(display_name)
      )
    `)
    .in("court_id", (courts || []).map(c => c.id))
    .in("status", ["ready", "on_court", "pending_signoff", "completed"])

  return (
    <CourtTvClient
      tournamentName={tournament.name}
      courts={courts || []}
      initialMatches={matches || []}
      divisionIds={divisionIds}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
