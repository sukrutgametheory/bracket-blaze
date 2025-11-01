"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Tournament } from "@/types/database"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

export function TournamentList() {
  const supabase = createClient()

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as Tournament[]
    },
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!tournaments || tournaments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No tournaments yet</CardTitle>
          <CardDescription>
            Create your first tournament to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/tournaments/new">Create Tournament</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "default"
      case "active":
        return "default"
      case "paused":
        return "secondary"
      case "completed":
        return "secondary"
      case "cancelled":
        return "destructive"
      default:
        return "default"
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tournaments.map((tournament) => (
        <Link
          key={tournament.id}
          href={`/tournaments/${tournament.id}`}
          className="transition-all hover:scale-105"
        >
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <CardTitle className="line-clamp-1">
                    {tournament.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-1">
                    {tournament.venue}
                  </CardDescription>
                </div>
                <Badge variant={getStatusColor(tournament.status)}>
                  {tournament.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Created{" "}
                {formatDistanceToNow(new Date(tournament.created_at), {
                  addSuffix: true,
                })}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Rest window: {tournament.rest_window_minutes} min
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
