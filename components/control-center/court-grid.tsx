"use client"

import { useState } from "react"
import { Court } from "@/types/database"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { X, Play, ClipboardCheck, Check, RotateCcw } from "lucide-react"

interface CourtGridProps {
  courts: Court[]
  matches: any[]
  selectedMatch: string | null
  onAssign: (matchId: string, courtId: string) => void
  onClear: (courtId: string) => void
  onStartMatch: (matchId: string) => void
  onRecordResult: (match: any) => void
  onApproveMatch?: (matchId: string) => void
  onRejectMatch?: (matchId: string, note?: string) => void
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'ready': return 'secondary' as const
    case 'on_court': return 'default' as const
    case 'pending_signoff': return 'destructive' as const
    case 'completed': return 'outline' as const
    default: return 'secondary' as const
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'on_court': return 'In Play'
    case 'pending_signoff': return 'Pending Sign-Off'
    default: return status
  }
}

function getElapsedTime(startTime: string | null): string {
  if (!startTime) return ''
  const start = new Date(startTime)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - start.getTime()) / 60000)
  if (minutes < 1) return '<1m'
  return `${minutes}m`
}

export function CourtGrid({
  courts,
  matches,
  selectedMatch,
  onAssign,
  onClear,
  onStartMatch,
  onRecordResult,
  onApproveMatch,
  onRejectMatch,
}: CourtGridProps) {
  const [rejectingMatch, setRejectingMatch] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  if (courts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No active courts</p>
        <p className="text-sm mt-2">Add courts to start assigning matches</p>
      </div>
    )
  }

  // Map courts to their current matches
  const courtMatches = new Map(
    matches.map(m => [m.court_id, m])
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {courts.map((court) => {
        const match = courtMatches.get(court.id)
        const isEmpty = !match
        const canAssign = selectedMatch && isEmpty

        return (
          <div
            key={court.id}
            onClick={() => {
              if (canAssign) {
                onAssign(selectedMatch, court.id)
              }
            }}
            className={cn(
              "border rounded-lg p-4 transition-all",
              canAssign && "cursor-pointer hover:border-primary hover:bg-primary/5",
              isEmpty && "bg-muted/30",
              !isEmpty && "bg-card",
              match?.status === 'on_court' && "border-green-500/50 bg-green-50/30 dark:bg-green-950/10",
              match?.status === 'pending_signoff' && "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10"
            )}
          >
            {/* Court Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{court.name}</h3>
                <Badge variant={isEmpty ? "secondary" : getStatusBadgeVariant(match.status)}>
                  {isEmpty ? "Available" : getStatusLabel(match.status)}
                </Badge>
                {match?.status === 'on_court' && match.actual_start_time && (
                  <span className="text-xs text-muted-foreground">
                    {getElapsedTime(match.actual_start_time)}
                  </span>
                )}
              </div>
              {match?.status === 'ready' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClear(court.id)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Match Details */}
            {!isEmpty && (
              <div className="space-y-2">
                {/* Division and Round */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {match.division?.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {match.phase === 'knockout' ? 'KO ' : ''}Round {match.round} • Match {match.sequence}
                  </span>
                </div>

                {/* Players */}
                <div className="space-y-1">
                  {/* Side A */}
                  <div className="flex items-center gap-2">
                    {match.side_a?.seed && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {match.side_a.seed}
                      </span>
                    )}
                    <span className="font-medium text-sm truncate">
                      {match.side_a?.participant?.display_name || "TBD"}
                    </span>
                  </div>

                  {/* VS or BYE */}
                  <div className="text-xs text-muted-foreground font-semibold text-center">
                    {match.side_b ? "VS" : "BYE"}
                  </div>

                  {/* Side B */}
                  {match.side_b && (
                    <div className="flex items-center gap-2">
                      {match.side_b?.seed && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          {match.side_b.seed}
                        </span>
                      )}
                      <span className="font-medium text-sm truncate">
                        {match.side_b?.participant?.display_name || "TBD"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Live Score (when on_court or pending_signoff with live_score data) */}
                {match.meta_json?.live_score && (match.status === 'on_court' || match.status === 'pending_signoff') && (
                  <div className="pt-1">
                    {/* Completed games */}
                    {match.meta_json?.games?.length > 0 && (
                      <div className="flex gap-1 mb-1">
                        {match.meta_json.games.map((game: any, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">
                            {game.score_a}-{game.score_b}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Current game score */}
                    <div className="text-sm font-mono font-semibold">
                      Game {match.meta_json.live_score.current_game}: {match.meta_json.live_score.score_a} - {match.meta_json.live_score.score_b}
                    </div>
                  </div>
                )}

                {/* Completed games summary (pending_signoff without live_score) */}
                {match.status === 'pending_signoff' && !match.meta_json?.live_score && match.meta_json?.games?.length > 0 && (
                  <div className="flex gap-1 pt-1">
                    {match.meta_json.games.map((game: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">
                        {game.score_a}-{game.score_b}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {match.status === 'ready' && (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartMatch(match.id)
                      }}
                    >
                      <Play className="h-3 w-3 mr-1" /> Start
                    </Button>
                  )}
                  {match.status === 'on_court' && (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRecordResult(match)
                      }}
                    >
                      <ClipboardCheck className="h-3 w-3 mr-1" /> Record Result
                    </Button>
                  )}
                  {match.status === 'pending_signoff' && onApproveMatch && onRejectMatch && (
                    <>
                      {rejectingMatch === match.id ? (
                        <div className="flex gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                          <Input
                            placeholder="Reason (optional)"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            className="flex-1 h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              onRejectMatch(match.id, rejectNote || undefined)
                              setRejectingMatch(null)
                              setRejectNote("")
                            }}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingMatch(null)
                              setRejectNote("")
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              onApproveMatch(match.id)
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              setRejectingMatch(match.id)
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {isEmpty && canAssign && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Click to assign selected match
              </div>
            )}
            {isEmpty && !canAssign && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Ready for assignment
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
