import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { TABLE_NAMES } from "@/types/database"
import { ScoringClient } from "@/components/scoring/scoring-client"

interface ScoringPageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ court?: string }>
}

export default async function ScoringPage({ params, searchParams }: ScoringPageProps) {
  const { token } = await params
  const { court: courtId } = await searchParams
  const supabase = await createClient()

  // Validate token against tournaments
  const { data: tournament } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("id, name, scoring_token")
    .eq("scoring_token", token)
    .eq("status", "active")
    .single()

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Invalid Scoring Link</h1>
          <p className="text-muted-foreground">
            This scoring link is invalid or the tournament is not active.
          </p>
        </div>
      </div>
    )
  }

  // Fetch all active courts for this tournament
  const { data: courts } = await supabase
    .from(TABLE_NAMES.COURTS)
    .select("*")
    .eq("tournament_id", tournament.id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  // If no court param, show court selection
  if (!courtId) {
    // Get matches assigned to courts to show status
    const { data: courtMatches } = await supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        id, status, court_id, meta_json,
        side_a:bracket_blaze_entries!side_a_entry_id(
          participant:bracket_blaze_participants(display_name)
        ),
        side_b:bracket_blaze_entries!side_b_entry_id(
          participant:bracket_blaze_participants(display_name)
        )
      `)
      .in("court_id", (courts || []).map(c => c.id))
      .in("status", ["ready", "on_court", "pending_signoff"])

    const courtMatchMap = new Map(
      (courtMatches || []).map(m => [m.court_id, m])
    )

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-muted-foreground">Select your court</p>
          </div>

          <div className="grid gap-3">
            {(courts || []).map(court => {
              const match = courtMatchMap.get(court.id) as any
              const hasMatch = !!match
              const sideAName = match?.side_a?.participant?.display_name
              const sideBName = match?.side_b?.participant?.display_name

              return (
                <a
                  key={court.id}
                  href={`/score/${token}?court=${court.id}`}
                  className="block border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-lg">{court.name}</span>
                    {hasMatch ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {match.status === "on_court" ? "In Play" : match.status === "ready" ? "Ready" : "Pending"}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        Empty
                      </span>
                    )}
                  </div>
                  {hasMatch && sideAName && sideBName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {sideAName} vs {sideBName}
                    </p>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Court param provided — look up match on this court
  const { data: match } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      id, status, round, sequence, phase, meta_json, court_id,
      division:bracket_blaze_divisions!inner(id, name),
      side_a:bracket_blaze_entries!side_a_entry_id(
        id, seed,
        participant:bracket_blaze_participants(id, display_name)
      ),
      side_b:bracket_blaze_entries!side_b_entry_id(
        id, seed,
        participant:bracket_blaze_participants(id, display_name)
      )
    `)
    .eq("court_id", courtId)
    .in("status", ["ready", "on_court", "pending_signoff"])
    .single()

  const court = (courts || []).find(c => c.id === courtId)
  const courtName = court?.name || "Unknown Court"

  // No active match on this court
  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">{courtName}</h1>
          <p className="text-muted-foreground">
            No active match on this court.
          </p>
          <p className="text-sm text-muted-foreground">
            Waiting for TD to assign a match.
          </p>
          <a
            href={`/score/${token}`}
            className="inline-block mt-4 text-sm text-primary underline"
          >
            Select a different court
          </a>
        </div>
      </div>
    )
  }

  const matchData = match as any

  return (
    <ScoringClient
      token={token}
      matchId={matchData.id}
      matchStatus={matchData.status}
      courtName={courtName}
      courtId={courtId}
      divisionName={matchData.division?.name || ""}
      roundInfo={`${matchData.phase === 'knockout' ? 'Knockout' : 'Round ' + matchData.round} • Match ${matchData.sequence}`}
      sideAName={matchData.side_a?.participant?.display_name || "Side A"}
      sideBName={matchData.side_b?.participant?.display_name || "Side B"}
      initialMetaJson={matchData.meta_json || {}}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
