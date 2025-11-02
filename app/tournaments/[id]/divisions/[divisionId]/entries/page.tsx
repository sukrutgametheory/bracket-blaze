import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament, type Division, type Entry, type Participant } from "@/types/database"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { EntryList } from "@/components/entries/entry-list"

interface EntriesPageProps {
  params: Promise<{ id: string; divisionId: string }>
}

export default async function EntriesPage({ params }: EntriesPageProps) {
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

  // Fetch entries for this division with participant details
  const { data: entries, error: entriesError } = await supabase
    .from(TABLE_NAMES.ENTRIES)
    .select(`
      *,
      participant:bracket_blaze_participants(*)
    `)
    .eq("division_id", divisionId)
    .order("seed", { ascending: true, nullsFirst: false })

  const typedEntries = (entries as any[]) || []

  // Fetch all participants for this tournament (for adding new entries)
  const { data: participants, error: participantsError } = await supabase
    .from(TABLE_NAMES.PARTICIPANTS)
    .select("*")
    .eq("tournament_id", id)
    .order("display_name", { ascending: true })

  const typedParticipants = (participants as Participant[]) || []

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Entry Management
            </h1>
            <p className="text-lg text-muted-foreground">{typedDivision.name}</p>
            <p className="text-sm text-muted-foreground">{typedTournament.name}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/tournaments/${id}/divisions`}>Back to Divisions</Link>
          </Button>
        </div>

        <EntryList
          entries={typedEntries}
          division={typedDivision}
          participants={typedParticipants}
          tournamentId={id}
          userId={user.id}
        />
      </div>
    </div>
  )
}
