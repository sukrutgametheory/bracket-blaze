"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameScore, KnockoutVariant, LiveScore, MatchScoreData, MatchStory } from "@/types/database"
import { getEntryDisplayName } from "@/lib/utils/display-name"
import {
  getKnockoutRoundCount,
  getKnockoutRoundLabel,
  getKnockoutVariant,
} from "@/lib/utils/knockout"

interface MatchCardProps {
  match: any
  isLive: boolean
  queuedMatch?: any
  queuedDrawState?: {
    bracket_size?: number
    knockout_variant?: KnockoutVariant
  }
  stories?: {
    pre_match?: MatchStory
    post_match?: MatchStory
  }
  drawState?: {
    bracket_size?: number
    knockout_variant?: KnockoutVariant
  }
}

function formatDuration(startTime: string | null): string {
  if (!startTime) return ""
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const mins = Math.floor((now - start) / 60000)
  if (mins < 1) return "Just started"
  return `${mins}m`
}

export function MatchCard({ match, isLive, queuedMatch, queuedDrawState, stories, drawState }: MatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const sideA = match.side_a as any
  const sideB = match.side_b as any
  const nameA = getEntryDisplayName(sideA)
  const nameB = getEntryDisplayName(sideB)
  const divisionName = match.division?.name || ""
  const courtName = match.court?.name || ""
  const metaJson = match.meta_json as MatchScoreData | null
  const games: GameScore[] = metaJson?.games || []
  const liveScore: LiveScore | null = metaJson?.live_score || null
  const isWalkover = metaJson?.walkover === true
  const isCompleted = match.status === "completed" || match.status === "walkover"
  const currentStory = isCompleted ? (stories?.post_match || stories?.pre_match) : stories?.pre_match
  const storyLabel = isCompleted ? "Recap" : "Story"
  const storyText = currentStory?.content || (isCompleted ? "Recap is being prepared." : "Story is being prepared.")
  const queuedSideA = queuedMatch?.side_a as any
  const queuedSideB = queuedMatch?.side_b as any
  const queuedNameA = queuedMatch ? getEntryDisplayName(queuedSideA) : ""
  const queuedNameB = queuedMatch ? getEntryDisplayName(queuedSideB) : ""

  // Round label
  const isKnockout = match.phase === "knockout"
  const knockoutVariant = getKnockoutVariant(drawState?.knockout_variant)
  const totalKnockoutRounds = getKnockoutRoundCount(drawState?.bracket_size, knockoutVariant) || match.round
  const roundLabel = isKnockout
    ? getKnockoutRoundLabel(match.round, totalKnockoutRounds, knockoutVariant)
    : `Round ${match.round}`
  const queuedIsKnockout = queuedMatch?.phase === "knockout"
  const queuedKnockoutVariant = getKnockoutVariant(queuedDrawState?.knockout_variant)
  const queuedTotalKnockoutRounds = getKnockoutRoundCount(
    queuedDrawState?.bracket_size,
    queuedKnockoutVariant
  ) || queuedMatch?.round
  const queuedRoundLabel = queuedMatch
    ? queuedIsKnockout
      ? getKnockoutRoundLabel(queuedMatch.round, queuedTotalKnockoutRounds, queuedKnockoutVariant)
      : `Round ${queuedMatch.round}`
    : ""

  // Duration
  const duration = isLive ? formatDuration(match.actual_start_time) : ""

  // Score display for completed matches
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

        {isLive && queuedMatch && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  Up Next
                </span>
                <span className="text-xs text-muted-foreground">
                  {queuedMatch.division?.name} &middot; {queuedRoundLabel}
                </span>
              </div>
              <div className="space-y-1">
                <p className="truncate text-sm font-medium text-foreground">{queuedNameA}</p>
                <p className="truncate text-sm font-medium text-foreground">{queuedNameB}</p>
              </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {isExpanded ? `Hide ${storyLabel}` : `Show ${storyLabel}`}
          </button>
          {currentStory?.status === "failed" && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Fallback
            </Badge>
          )}
          {(currentStory?.status === "pending" || currentStory?.status === "generating") && (
            <span className="text-[11px] text-muted-foreground">
              Updating
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-3">
            <p className="text-sm leading-6 text-foreground/90">
              {storyText}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
