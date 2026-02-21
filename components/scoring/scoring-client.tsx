"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import type { GameScore, LiveScore, MatchScoreData } from "@/types/database"

interface ScoringClientProps {
  token: string
  matchId: string
  matchStatus: string
  courtName: string
  courtId: string
  divisionName: string
  roundInfo: string
  sideAName: string
  sideBName: string
  initialMetaJson: any
  supabaseUrl: string
  supabaseAnonKey: string
}

export function ScoringClient({
  token,
  matchId,
  matchStatus: initialStatus,
  courtName,
  courtId,
  divisionName,
  roundInfo,
  sideAName,
  sideBName,
  initialMetaJson,
  supabaseUrl,
  supabaseAnonKey,
}: ScoringClientProps) {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))
  const [status, setStatus] = useState(initialStatus)
  const [liveScore, setLiveScore] = useState<LiveScore>(
    initialMetaJson?.live_score || { current_game: 1, score_a: 0, score_b: 0 }
  )
  const [games, setGames] = useState<GameScore[]>(initialMetaJson?.games || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<string | null>(null)
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Subscribe to Broadcast for multi-device sync
  useEffect(() => {
    const channel = supabase.channel(`match:${matchId}`)
      .on("broadcast", { event: "score_update" }, (payload) => {
        const data = payload.payload
        if (data.live_score) setLiveScore(data.live_score)
        if (data.games) setGames(data.games)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, matchId])

  // Subscribe to postgres_changes for status transitions (reject, approve)
  useEffect(() => {
    const channel = supabase.channel(`match-status:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bracket_blaze_matches",
          filter: `id=eq.${matchId}`,
        },
        async (payload) => {
          const newStatus = payload.new.status as string
          setStatus(newStatus)

          if (newStatus === "on_court" && status === "pending_signoff") {
            // Rejected — fetch the latest td_reject event for the note
            const { data: rejectEvent } = await supabase
              .from("bracket_blaze_match_events")
              .select("payload_json")
              .eq("match_id", matchId)
              .eq("event_type", "td_reject")
              .order("timestamp", { ascending: false })
              .limit(1)
              .single()

            const note = (rejectEvent?.payload_json as any)?.note
            setRejectNote(note || "No reason given")
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, matchId, status])

  const broadcastUpdate = useCallback((newLiveScore: LiveScore, newGames: GameScore[]) => {
    supabase.channel(`match:${matchId}`).send({
      type: "broadcast",
      event: "score_update",
      payload: { live_score: newLiveScore, games: newGames },
    })
  }, [supabase, matchId])

  const handleStartMatch = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc("bracket_blaze_start_match_from_referee", {
        p_token: token,
        p_match_id: matchId,
      })
      if (rpcError) throw rpcError
      setStatus("on_court")
      const newLiveScore = data.live_score || { current_game: 1, score_a: 0, score_b: 0 }
      setLiveScore(newLiveScore)
      broadcastUpdate(newLiveScore, games)
    } catch (e: any) {
      setError(e.message || "Failed to start match")
    } finally {
      setLoading(false)
    }
  }

  const handleScorePoint = async (side: "A" | "B") => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc("bracket_blaze_score_point", {
        p_token: token,
        p_match_id: matchId,
        p_side: side,
      })
      if (rpcError) throw rpcError
      const newLiveScore = data.live_score
      const newGames = data.games || games
      setLiveScore(newLiveScore)
      setGames(newGames)
      broadcastUpdate(newLiveScore, newGames)
    } catch (e: any) {
      setError(e.message || "Failed to score point")
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc("bracket_blaze_undo_point", {
        p_token: token,
        p_match_id: matchId,
      })
      if (rpcError) throw rpcError
      const newLiveScore = data.live_score
      const newGames = data.games || games
      setLiveScore(newLiveScore)
      setGames(newGames)
      broadcastUpdate(newLiveScore, newGames)
    } catch (e: any) {
      setError(e.message || "Failed to undo")
    } finally {
      setLoading(false)
    }
  }

  const handleEndGame = async () => {
    setLoading(true)
    setError(null)
    setShowEndGameConfirm(false)
    try {
      const { data, error: rpcError } = await supabase.rpc("bracket_blaze_end_game", {
        p_token: token,
        p_match_id: matchId,
      })
      if (rpcError) throw rpcError
      const newLiveScore = data.live_score
      const newGames = data.games
      setLiveScore(newLiveScore)
      setGames(newGames)
      broadcastUpdate(newLiveScore, newGames)
    } catch (e: any) {
      setError(e.message || "Failed to end game")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitMatch = async () => {
    setLoading(true)
    setError(null)
    setShowSubmitConfirm(false)
    try {
      const { data, error: rpcError } = await supabase.rpc("bracket_blaze_submit_match", {
        p_token: token,
        p_match_id: matchId,
      })
      if (rpcError) throw rpcError
      setStatus("pending_signoff")
    } catch (e: any) {
      setError(e.message || "Failed to submit match")
    } finally {
      setLoading(false)
    }
  }

  // Match in "ready" status — show start button
  if (status === "ready") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{courtName} &bull; {divisionName} &bull; {roundInfo}</p>
            <h1 className="text-2xl font-bold">{sideAName}</h1>
            <p className="text-muted-foreground font-semibold">VS</p>
            <h1 className="text-2xl font-bold">{sideBName}</h1>
          </div>
          <Button
            onClick={handleStartMatch}
            disabled={loading}
            className="w-full h-16 text-xl"
          >
            {loading ? "Starting..." : "Start Match"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    )
  }

  // Match pending sign-off — show waiting state
  if (status === "pending_signoff") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{courtName} &bull; {divisionName}</p>
            <h1 className="text-xl font-bold">Submitted — Waiting for TD Sign-Off</h1>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {sideAName} vs {sideBName}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {games.map((game, i) => (
                <span key={i} className="px-3 py-1 bg-muted rounded text-sm font-mono">
                  {game.score_a}-{game.score_b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Match completed
  if (status === "completed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <h1 className="text-2xl font-bold">Match Complete</h1>
          <p className="text-muted-foreground">{sideAName} vs {sideBName}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {games.map((game, i) => (
              <span key={i} className="px-3 py-1 bg-muted rounded text-sm font-mono">
                {game.score_a}-{game.score_b}
              </span>
            ))}
          </div>
          <a
            href={`/score/${token}?court=${courtId}`}
            className="inline-block text-sm text-primary underline"
          >
            Score next match on this court
          </a>
        </div>
      </div>
    )
  }

  // Main scoring interface (status === "on_court")
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b text-center space-y-0.5">
        <p className="text-xs text-muted-foreground">
          {courtName} &bull; {divisionName} &bull; {roundInfo}
        </p>
        {rejectNote && (
          <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
            TD Note: {rejectNote}
          </div>
        )}
      </div>

      {/* Completed Games */}
      {games.length > 0 && (
        <div className="px-4 py-2 flex gap-2 justify-center border-b">
          {games.map((game, i) => (
            <span key={i} className="px-3 py-1 bg-muted rounded text-sm font-mono">
              {game.score_a}-{game.score_b}
            </span>
          ))}
        </div>
      )}

      {/* Current Game Score — fills available space */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <p className="text-xs text-muted-foreground mb-2">
          Game {liveScore.current_game}
        </p>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-sm font-medium truncate max-w-[120px]">{sideAName}</p>
            <p className="text-6xl font-bold tabular-nums">{liveScore.score_a}</p>
          </div>
          <span className="text-2xl text-muted-foreground">-</span>
          <div className="text-center">
            <p className="text-sm font-medium truncate max-w-[120px]">{sideBName}</p>
            <p className="text-6xl font-bold tabular-nums">{liveScore.score_b}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons — fixed at bottom */}
      <div className="px-4 pb-6 space-y-3">
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Score Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleScorePoint("A")}
            disabled={loading}
            className="h-20 text-xl"
          >
            +1 {sideAName.split(" ")[0]}
          </Button>
          <Button
            onClick={() => handleScorePoint("B")}
            disabled={loading}
            className="h-20 text-xl"
          >
            +1 {sideBName.split(" ")[0]}
          </Button>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={handleUndo}
            disabled={loading}
            className="h-12"
          >
            Undo
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowEndGameConfirm(true)}
            disabled={loading}
            className="h-12"
          >
            End Game
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={loading || games.length === 0}
            className="h-12"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* End Game Confirmation */}
      {showEndGameConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold">End Game {liveScore.current_game}?</h2>
            <p className="text-muted-foreground">
              Score: {liveScore.score_a} - {liveScore.score_b}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowEndGameConfirm(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleEndGame} disabled={loading}>
                End Game
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Match Confirmation */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold">Submit Match for Sign-Off?</h2>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {sideAName} vs {sideBName}
              </p>
              <div className="flex gap-2 flex-wrap">
                {games.map((game, i) => (
                  <span key={i} className="px-3 py-1 bg-muted rounded text-sm font-mono">
                    {game.score_a}-{game.score_b}
                  </span>
                ))}
              </div>
              {liveScore.score_a > 0 || liveScore.score_b > 0 ? (
                <p className="text-xs text-destructive">
                  Current game ({liveScore.score_a}-{liveScore.score_b}) has not been ended.
                  End the game first, or these points will be lost.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSubmitConfirm(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmitMatch} disabled={loading}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
