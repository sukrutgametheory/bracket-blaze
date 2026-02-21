"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import type { Court, LiveScore, GameScore } from "@/types/database"

interface CourtTvMatch {
  id: string
  status: string
  court_id: string
  meta_json: any
  round: number
  sequence: number
  phase: string
  division: { id: string; name: string }
  side_a: { participant: { display_name: string } } | null
  side_b: { participant: { display_name: string } } | null
}

interface CourtTvClientProps {
  tournamentName: string
  courts: Court[]
  initialMatches: any[]
  divisionIds: string[]
  supabaseUrl: string
  supabaseAnonKey: string
}

function getStatusDisplay(status: string) {
  switch (status) {
    case "ready": return { label: "Ready", color: "bg-blue-500" }
    case "on_court": return { label: "In Play", color: "bg-green-500 animate-pulse" }
    case "pending_signoff": return { label: "Pending", color: "bg-yellow-500" }
    case "completed": return { label: "Done", color: "bg-gray-500" }
    default: return { label: "Empty", color: "bg-gray-700" }
  }
}

export function CourtTvClient({
  tournamentName,
  courts,
  initialMatches,
  divisionIds,
  supabaseUrl,
  supabaseAnonKey,
}: CourtTvClientProps) {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))
  const [matches, setMatches] = useState<CourtTvMatch[]>(initialMatches as CourtTvMatch[])

  // Build court → match map
  const courtMatchMap = new Map(
    matches.map(m => [m.court_id, m])
  )

  // Stable key for Broadcast subscription dependencies
  const matchKey = matches.map(m => `${m.id}:${m.status}`).join(",")

  // Subscribe to Broadcast channels for each active match
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

  // Subscribe to postgres_changes for status transitions (new assignments, completions)
  useEffect(() => {
    if (divisionIds.length === 0) return

    const channel = supabase.channel("court-tv-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bracket_blaze_matches",
        },
        () => {
          // Full page refresh on status change to get fresh data with joins
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

  // Grid columns based on court count
  const gridCols = courts.length <= 4
    ? "grid-cols-1 sm:grid-cols-2"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{tournamentName}</h1>
        <p className="text-gray-400 text-sm">Live Scores</p>
      </div>

      {/* Court Grid */}
      <div className={`grid ${gridCols} gap-4 max-w-6xl mx-auto`}>
        {courts.map(court => {
          const match = courtMatchMap.get(court.id)
          const statusDisplay = getStatusDisplay(match?.status || "empty")
          const metaJson = match?.meta_json || {}
          const liveScore: LiveScore | null = metaJson.live_score || null
          const games: GameScore[] = metaJson.games || []
          const sideAName = match?.side_a?.participant?.display_name || ""
          const sideBName = match?.side_b?.participant?.display_name || ""

          return (
            <div
              key={court.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-5"
            >
              {/* Court Name + Status */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-100">{court.name}</h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white ${statusDisplay.color}`}>
                  {statusDisplay.label}
                </span>
              </div>

              {match ? (
                <div className="space-y-3">
                  {/* Player Names + Live Score */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium truncate flex-1">{sideAName}</span>
                      {liveScore && match.status === "on_court" && (
                        <span className="text-3xl font-bold tabular-nums ml-3">
                          {liveScore.score_a}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium truncate flex-1">{sideBName}</span>
                      {liveScore && match.status === "on_court" && (
                        <span className="text-3xl font-bold tabular-nums ml-3">
                          {liveScore.score_b}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Completed Games */}
                  {games.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {games.map((game, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-sm font-mono text-gray-300">
                          {game.score_a}-{game.score_b}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Division */}
                  <p className="text-xs text-gray-500">
                    {match.division?.name}
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-600">
                  <p className="text-sm">No match assigned</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
