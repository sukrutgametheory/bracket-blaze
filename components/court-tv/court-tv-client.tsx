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

  // Build court → match map, prioritizing active statuses over completed
  const statusPriority: Record<string, number> = {
    completed: 0,
    ready: 1,
    pending_signoff: 2,
    on_court: 3,
  }
  const sortedMatches = [...matches].sort(
    (a, b) => (statusPriority[a.status] || 0) - (statusPriority[b.status] || 0)
  )
  const courtMatchMap = new Map(
    sortedMatches.map(m => [m.court_id, m])
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
    <div className="min-h-screen text-white" style={{ background: "#04060e" }}>
      {/* Scoreboard font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .tv-score {
          font-family: 'Oswald', sans-serif;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .live-glow {
          text-shadow: 0 0 40px rgba(255, 255, 255, 0.15);
        }
        .card-live {
          border-left: 4px solid #22c55e;
          box-shadow: inset 6px 0 24px -12px rgba(34, 197, 94, 0.25);
        }
        .card-pending {
          border-left: 4px solid #eab308;
          box-shadow: inset 6px 0 24px -12px rgba(234, 179, 8, 0.2);
        }
        .card-ready {
          border-left: 4px solid #3b82f6;
          box-shadow: inset 6px 0 24px -12px rgba(59, 130, 246, 0.2);
        }
        .card-idle {
          border-left: 4px solid transparent;
        }
        .pulse-dot {
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div className="text-center pt-6 pb-5">
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight"
          style={{ color: "#e2e8f0" }}
        >
          {tournamentName}
        </h1>
        <p
          className="text-xs font-semibold uppercase tracking-[0.3em] mt-1.5"
          style={{ color: "#475569" }}
        >
          Live Scores
        </p>
      </div>

      {/* Court Grid */}
      <div className={`grid ${gridCols} gap-5 max-w-7xl mx-auto px-5 pb-8`}>
        {courts.map(court => {
          const match = courtMatchMap.get(court.id)
          const metaJson = match?.meta_json || {}
          const liveScore: LiveScore | null = metaJson.live_score || null
          const games: GameScore[] = metaJson.games || []
          const sideAName = match?.side_a?.participant?.display_name || ""
          const sideBName = match?.side_b?.participant?.display_name || ""
          const isLive = match?.status === "on_court"
          const isPending = match?.status === "pending_signoff"
          const isReady = match?.status === "ready"

          const cardAccent = isLive
            ? "card-live"
            : isPending
            ? "card-pending"
            : isReady
            ? "card-ready"
            : "card-idle"

          const showScore = isLive || isPending

          return (
            <div
              key={court.id}
              className={`rounded-lg overflow-hidden ${cardAccent}`}
              style={{ background: "#0c1120" }}
            >
              {/* Court header bar */}
              <div
                className="flex items-center justify-between px-5 py-2.5"
                style={{ background: "#111827" }}
              >
                <span
                  className="text-xs font-bold uppercase tracking-[0.2em]"
                  style={{ color: "#64748b" }}
                >
                  {court.name}
                </span>

                {match ? (
                  <span className="flex items-center gap-2">
                    {isLive && (
                      <span
                        className="pulse-dot inline-block w-2 h-2 rounded-full"
                        style={{ background: "#22c55e" }}
                      />
                    )}
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: isLive
                          ? "#4ade80"
                          : isPending
                          ? "#facc15"
                          : isReady
                          ? "#60a5fa"
                          : "#64748b",
                      }}
                    >
                      {isLive
                        ? "Live"
                        : isPending
                        ? "Pending"
                        : isReady
                        ? "Ready"
                        : "Final"}
                    </span>
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "#334155" }}
                  >
                    No Match
                  </span>
                )}
              </div>

              {match ? (
                <div className="px-5 py-4">
                  {/* Player A */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-lg sm:text-xl font-medium truncate flex-1 mr-4"
                      style={{ color: "#e2e8f0" }}
                    >
                      {sideAName}
                    </span>
                    {showScore && liveScore && (
                      <span
                        className={`tv-score text-6xl sm:text-7xl font-bold ${isLive ? "live-glow" : ""}`}
                        style={{ color: "#ffffff", minWidth: "1.5ch", textAlign: "right" }}
                      >
                        {liveScore.score_a}
                      </span>
                    )}
                  </div>

                  {/* Divider */}
                  <div
                    className="my-2"
                    style={{
                      height: "1px",
                      background: "linear-gradient(to right, rgba(100,116,139,0.3), transparent)",
                    }}
                  />

                  {/* Player B */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-lg sm:text-xl font-medium truncate flex-1 mr-4"
                      style={{ color: "#e2e8f0" }}
                    >
                      {sideBName}
                    </span>
                    {showScore && liveScore && (
                      <span
                        className={`tv-score text-6xl sm:text-7xl font-bold ${isLive ? "live-glow" : ""}`}
                        style={{ color: "#ffffff", minWidth: "1.5ch", textAlign: "right" }}
                      >
                        {liveScore.score_b}
                      </span>
                    )}
                  </div>

                  {/* Footer: completed games + division */}
                  <div
                    className="flex items-center justify-between mt-4 pt-3"
                    style={{ borderTop: "1px solid rgba(100,116,139,0.15)" }}
                  >
                    {games.length > 0 ? (
                      <div className="flex gap-2">
                        {games.map((game, i) => (
                          <span
                            key={i}
                            className="text-xs font-mono font-medium px-2 py-0.5 rounded"
                            style={{ background: "#1e293b", color: "#94a3b8" }}
                          >
                            {game.score_a}-{game.score_b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div />
                    )}
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: "#475569" }}
                    >
                      {match.division?.name} &middot; Round {match.round}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-14 text-center">
                  <p
                    className="text-sm uppercase tracking-wider"
                    style={{ color: "#1e293b" }}
                  >
                    Awaiting Assignment
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
