import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament, type Court } from "@/types/database"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CourtList } from "@/components/courts/court-list"

interface CourtsPageProps {
  params: Promise<{ id: string }>
}

export default async function CourtsPage({ params }: CourtsPageProps) {
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

  // Fetch courts for this tournament
  const { data: courts, error: courtsError } = await supabase
    .from(TABLE_NAMES.COURTS)
    .select("*")
    .eq("tournament_id", id)
    .order("name", { ascending: true })

  const typedCourts = (courts as Court[]) || []

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Court Management
            </h1>
            <p className="text-muted-foreground">{typedTournament.name}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/tournaments/${id}`}>Back to Tournament</Link>
          </Button>
        </div>

        <CourtList courts={typedCourts} tournamentId={id} userId={user.id} />
      </div>
    </div>
  )
}
