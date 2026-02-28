import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { RegistrationForm } from "@/components/register/registration-form"

interface RegisterPageProps {
  params: Promise<{ tournamentId: string }>
}

export async function generateMetadata({ params }: RegisterPageProps) {
  const { tournamentId } = await params
  const supabase = await createClient()

  const { data } = await supabase.rpc("bracket_blaze_registration_lookup", {
    p_tournament_id: tournamentId,
  })

  const tournament = data?.tournament
  return {
    title: tournament
      ? `Register - ${tournament.name}`
      : "Tournament Registration",
  }
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { tournamentId } = await params
  const supabase = await createClient()

  // Call lookup RPC without phone to get tournament + division info
  const { data, error } = await supabase.rpc(
    "bracket_blaze_registration_lookup",
    { p_tournament_id: tournamentId }
  )

  if (error || !data?.tournament) {
    notFound()
  }

  const tournament = data.tournament
  const divisions = data.divisions || []

  // Registration closed
  if (!tournament.registration_open) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">{tournament.venue}</p>
          <div className="bg-white rounded-lg border p-6">
            <p className="text-lg font-medium">Registration is closed</p>
            <p className="text-sm text-muted-foreground mt-2">
              Contact the tournament director for more information.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <RegistrationForm
          tournamentId={tournamentId}
          tournamentName={tournament.name}
          tournamentVenue={tournament.venue}
          divisions={divisions}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
        />
      </div>
    </div>
  )
}
