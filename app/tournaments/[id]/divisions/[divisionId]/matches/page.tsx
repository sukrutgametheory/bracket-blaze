import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament, type Division } from "@/types/database"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface MatchesPageProps {
  params: Promise<{ id: string; divisionId: string }>
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { id, divisionId } = await params
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

  // Fetch division
  const { data: division, error: divisionError } = await supabase
    .from(TABLE_NAMES.DIVISIONS)
    .select("*")
    .eq("id", divisionId)
    .eq("tournament_id", id)
    .single()

  if (divisionError || !division) {
    notFound()
  }

  const typedDivision = division as Division

  // Fetch matches with entry/participant details
  const { data: matches, error: matchesError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      *,
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
    .eq("division_id", divisionId)
    .order("round", { ascending: true })
    .order("sequence", { ascending: true })

  const typedMatches = (matches as any[]) || []

  // Group matches by round
  const matchesByRound = typedMatches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = []
    }
    acc[match.round].push(match)
    return acc
  }, {} as Record<number, any[]>)

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Matches & Draw
            </h1>
            <p className="text-lg text-muted-foreground">{typedDivision.name}</p>
            <p className="text-sm text-muted-foreground">{typedTournament.name}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/tournaments/${id}/divisions/${divisionId}/entries`}>
                Back to Entries
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/tournaments/${id}/divisions`}>
                Back to Divisions
              </Link>
            </Button>
          </div>
        </div>

        {typedMatches.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No matches have been generated yet
              </p>
              <Button asChild>
                <Link href={`/tournaments/${id}/divisions/${divisionId}/entries`}>
                  Go to Entries to Generate Draw
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.keys(matchesByRound)
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map((roundNum) => {
                const roundMatches = matchesByRound[parseInt(roundNum)]
                return (
                  <Card key={roundNum}>
                    <CardHeader>
                      <CardTitle>Round {roundNum}</CardTitle>
                      <CardDescription>
                        {roundMatches.length} matches
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {roundMatches.map((match: any) => {
                          const sideA = match.side_a as any
                          const sideB = match.side_b as any
                          const isBye = !sideB

                          return (
                            <div
                              key={match.id}
                              className="border rounded-lg p-4"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="text-sm text-muted-foreground mb-2">
                                    Match {match.sequence}
                                  </div>
                                  <div className="space-y-2">
                                    {/* Side A */}
                                    <div className="flex items-center gap-3">
                                      {sideA?.seed && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                                          {sideA.seed}
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-semibold">
                                          {sideA?.participant?.display_name || "TBD"}
                                        </p>
                                        {sideA?.participant?.club && (
                                          <p className="text-xs text-muted-foreground">
                                            {sideA.participant.club}
                                          </p>
                                        )}
                                      </div>
                                      {match.winner_side === "A" && (
                                        <Badge>Winner</Badge>
                                      )}
                                    </div>

                                    {/* VS or BYE */}
                                    <div className="text-center text-sm text-muted-foreground font-semibold">
                                      {isBye ? "BYE" : "VS"}
                                    </div>

                                    {/* Side B */}
                                    {!isBye && (
                                      <div className="flex items-center gap-3">
                                        {sideB?.seed && (
                                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                                            {sideB.seed}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-semibold">
                                            {sideB?.participant?.display_name || "TBD"}
                                          </p>
                                          {sideB?.participant?.club && (
                                            <p className="text-xs text-muted-foreground">
                                              {sideB.participant.club}
                                            </p>
                                          )}
                                        </div>
                                        {match.winner_side === "B" && (
                                          <Badge>Winner</Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Match Status */}
                                <div className="text-right">
                                  <Badge
                                    variant={
                                      match.status === "completed"
                                        ? "default"
                                        : match.status === "on_court"
                                          ? "default"
                                          : "secondary"
                                    }
                                  >
                                    {match.status}
                                  </Badge>
                                  {match.court_id && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      Court assigned
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
