"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StandingsSection } from "@/components/control-center/standings-section"
import { MatchCard } from "./match-card"
import type { Division } from "@/types/database"
import type { RankedStanding } from "@/lib/services/standings-engine"

interface LivePortalClientProps {
  tournamentName: string
  divisions: Division[]
  matches: any[]
  draws: { division_id: string; state_json: any }[]
  standings: Record<string, RankedStanding[]>
  entries: any[]
  divisionIds: string[]
  supabaseUrl: string
  supabaseAnonKey: string
}

export function LivePortalClient({
  tournamentName,
  divisions,
  matches: initialMatches,
  draws,
  standings,
  entries,
  divisionIds,
  supabaseUrl,
  supabaseAnonKey,
}: LivePortalClientProps) {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))
  const [matches, setMatches] = useState(initialMatches)
  const [divisionFilter, setDivisionFilter] = useState<string>("all")

  // Stable key for Broadcast subscription dependencies
  const matchKey = matches.map(m => `${m.id}:${m.status}`).join(",")

  // Subscribe to Broadcast channels for each active match (live score ticks)
  useEffect(() => {
    const activeMatches = matches.filter(m => m.status === "on_court")
    const channels = activeMatches.map(match => {
      return supabase.channel(`match:${match.id}`)
        .on("broadcast", { event: "score_update" }, (payload) => {
          const data = payload.payload
          setMatches(prev => prev.map(m => {
            if (m.id !== match.id) return m
            return {
              ...m,
              meta_json: {
                ...m.meta_json,
                live_score: data.live_score,
                games: data.games || m.meta_json?.games,
              },
            }
          }))
        })
        .subscribe()
    })

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, matchKey])

  // Subscribe to postgres_changes for status transitions (new results, completions)
  useEffect(() => {
    if (divisionIds.length === 0) return

    const channel = supabase.channel("live-portal-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bracket_blaze_matches",
        },
        () => {
          window.location.reload()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, divisionIds])

  // Auto-reconnect on visibility change (tab/screen wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        window.location.reload()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  // Filter matches by division
  const filteredMatches = useMemo(() => {
    const filtered = divisionFilter === "all"
      ? matches
      : matches.filter(m => m.division_id === divisionFilter)

    // Live matches first, then completed sorted newest-first
    const live = filtered
      .filter(m => m.status === "on_court")
      .sort((a, b) => a.round - b.round || a.sequence - b.sequence)
    const completed = filtered
      .filter(m => m.status === "completed" || m.status === "walkover")
      .sort((a, b) => {
        // Newest first
        if (a.actual_end_time && b.actual_end_time) {
          return new Date(b.actual_end_time).getTime() - new Date(a.actual_end_time).getTime()
        }
        // Fallback: higher round first, then higher sequence
        if (a.round !== b.round) return b.round - a.round
        return b.sequence - a.sequence
      })

    return [...live, ...completed]
  }, [matches, divisionFilter])

  // Filter divisions/standings for standings tab
  const filteredDivisions = divisionFilter === "all"
    ? divisions
    : divisions.filter(d => d.id === divisionFilter)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            {tournamentName}
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        {/* Division Filter */}
        {divisions.length > 1 && (
          <div className="mb-4">
            <Select value={divisionFilter} onValueChange={setDivisionFilter}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="All Divisions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="matches">
          <TabsList>
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-4">
            {filteredMatches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No matches yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl">
                {filteredMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    isLive={match.status === "on_court"}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="standings" className="mt-4">
            <StandingsSection
              divisions={filteredDivisions}
              standings={standings}
              draws={draws}
              entries={entries}
              matches={matches}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
