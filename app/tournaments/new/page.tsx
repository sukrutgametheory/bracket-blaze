import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { TournamentForm } from "@/components/tournaments/tournament-form"

export const metadata = {
  title: "Create Tournament | Bracket Blaze",
  description: "Create a new tournament",
}

export default async function NewTournamentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Create Tournament</h1>
          <p className="text-muted-foreground mt-2">
            Set up a new racquet sports tournament
          </p>
        </div>
        <TournamentForm userId={user.id} />
      </div>
    </div>
  )
}
