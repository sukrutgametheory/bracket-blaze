import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament, type Participant } from "@/types/database"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ParticipantList } from "@/components/participants/participant-list"
import { BackfillModal } from "@/components/participants/backfill-modal"

interface ParticipantsPageProps {
  params: Promise<{ id: string }>
}

export default async function ParticipantsPage({ params }: ParticipantsPageProps) {
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

  // Fetch participants for this tournament
  const { data: participants, error: participantsError } = await supabase
    .from(TABLE_NAMES.PARTICIPANTS)
    .select("*")
    .eq("tournament_id", id)
    .order("display_name", { ascending: true })

  const typedParticipants = (participants as Participant[]) || []

  // Find participants that need phone numbers (player_id is NULL)
  const unlinkedParticipants = typedParticipants.filter((p) => !p.player_id)

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Participant Management
            </h1>
            <p className="text-muted-foreground">{typedTournament.name}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/tournaments/${id}`}>Back to Tournament</Link>
          </Button>
        </div>

        <ParticipantList
          participants={typedParticipants}
          tournamentId={id}
          userId={user.id}
        />

        {unlinkedParticipants.length > 0 && (
          <BackfillModal
            unlinkedParticipants={unlinkedParticipants}
            tournamentId={id}
          />
        )}
      </div>
    </div>
  )
}
