import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { TournamentList } from "@/components/tournaments/tournament-list"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export const metadata = {
  title: "Tournaments | Bracket Blaze",
  description: "View and manage your tournaments",
}

export default async function TournamentsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Tournaments</h1>
          <p className="text-muted-foreground mt-2">
            Manage your racquet sports tournaments
          </p>
        </div>
        <Button asChild>
          <Link href="/tournaments/new">Create Tournament</Link>
        </Button>
      </div>
      <TournamentList />
    </div>
  )
}
