"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameScore, LiveScore, MatchScoreData } from "@/types/database"

interface MatchCardProps {
  match: any
  isLive: boolean
}

function getKnockoutRoundLabel(round: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - round
  if (roundsFromEnd === 0) return "Final"
  if (roundsFromEnd === 1) return "Semi-Final"
  if (roundsFromEnd === 2) return "Quarter-Final"
  return `Round of ${Math.pow(2, roundsFromEnd + 1)}`
}

function formatDuration(startTime: string | null): string {
  if (!startTime) return ""
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const mins = Math.floor((now - start) / 60000)
  if (mins < 1) return "Just started"
  return `${mins}m`
}

export function MatchCard({ match, isLive }: MatchCardProps) {
  const sideA = match.side_a as any
  const sideB = match.side_b as any
  const nameA = sideA?.participant?.display_name || "TBD"
  const nameB = sideB?.participant?.display_name || "TBD"
  const divisionName = match.division?.name || ""
  const courtName = match.court?.name || ""
  const metaJson = match.meta_json as MatchScoreData | null
  const games: GameScore[] = metaJson?.games || []
  const liveScore: LiveScore | null = metaJson?.live_score || null
  const isWalkover = metaJson?.walkover === true
  const isCompleted = match.status === "completed" || match.status === "walkover"

  // Round label
  const isKnockout = match.phase === "knockout"
  // For knockout, estimate total rounds from the match round (best we can do without draw state)
  const roundLabel = isKnockout
    ? getKnockoutRoundLabel(match.round, match.round) // Will show "Final" for highest round
    : `Round ${match.round}`

  // Duration
  const duration = isLive ? formatDuration(match.actual_start_time) : ""

  // Score display for completed matches
  const scoreStr = isWalkover
    ? "W/O"
    : games.length > 0
    ? games.map(g => `${g.score_a}-${g.score_b}`).join(", ")
    : ""

  return (
    <Card className={cn(
      "overflow-hidden transition-colors",
      isLive && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
    )}>
      <CardContent className="p-4">
        {/* Header: Live indicator + Division + Round */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">
                  Live
                </span>
              </span>
            )}
            {isKnockout && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                KO
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {divisionName} &middot; {roundLabel}
          </span>
        </div>

        {/* Players and scores */}
        <div className="space-y-1.5">
          {/* Side A */}
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-sm truncate flex-1 mr-3",
              isCompleted && match.winner_side === "A" && "font-semibold"
            )}>
              {nameA}
            </span>
            {isLive && liveScore && (
              <span className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300 min-w-[2ch] text-right">
                {liveScore.score_a}
              </span>
            )}
          </div>

          {/* Side B */}
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-sm truncate flex-1 mr-3",
              isCompleted && match.winner_side === "B" && "font-semibold"
            )}>
              {nameB}
            </span>
            {isLive && liveScore && (
              <span className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300 min-w-[2ch] text-right">
                {liveScore.score_b}
              </span>
            )}
          </div>
        </div>

        {/* Footer: Game scores + Court + Duration */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            {isWalkover ? (
              <Badge variant="secondary" className="text-xs">W/O</Badge>
            ) : games.length > 0 ? (
              games.map((game, i) => (
                <span
                  key={i}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {game.score_a}-{game.score_b}
                </span>
              ))
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {courtName && `${courtName}`}
            {courtName && duration && " \u00B7 "}
            {duration}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
