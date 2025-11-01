import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TABLE_NAMES, type Tournament } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface TournamentPageProps {
  params: Promise<{ id: string }>
}

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: tournament, error } = await supabase
    .from(TABLE_NAMES.TOURNAMENTS)
    .select("*")
    .eq("id", id)
    .single()

  if (error || !tournament) {
    notFound()
  }

  const typedTournament = tournament as Tournament

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "secondary"
      case "active":
        return "default"
      case "completed":
        return "secondary"
      default:
        return "default"
    }
  }

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-4xl font-bold tracking-tight">
                {typedTournament.name}
              </h1>
              <Badge variant={getStatusColor(typedTournament.status)}>
                {typedTournament.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">{typedTournament.venue}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/tournaments">Back to Tournaments</Link>
          </Button>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Details</CardTitle>
              <CardDescription>Basic information about this tournament</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Venue</p>
                  <p className="text-lg">{typedTournament.venue}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Timezone</p>
                  <p className="text-lg">{typedTournament.timezone}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rest Window</p>
                  <p className="text-lg">{typedTournament.rest_window_minutes} minutes</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <p className="text-lg capitalize">{typedTournament.status}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Setup Progress</CardTitle>
              <CardDescription>
                Complete these steps to prepare your tournament
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    ✓
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tournament Created</p>
                    <p className="text-sm text-muted-foreground">
                      Basic details configured
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 opacity-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Add Courts</p>
                    <p className="text-sm text-muted-foreground">
                      Configure available courts (Coming soon in Phase 2)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 opacity-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Create Divisions</p>
                    <p className="text-sm text-muted-foreground">
                      Set up competition divisions (Coming soon in Phase 2)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 opacity-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted">
                    4
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Add Participants</p>
                    <p className="text-sm text-muted-foreground">
                      Register players and teams (Coming soon in Phase 2)
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
