"use client"

import { Court } from "@/types/database"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface CourtGridProps {
  courts: Court[]
  matches: any[]
  selectedMatch: string | null
  onAssign: (matchId: string, courtId: string) => void
  onClear: (courtId: string) => void
}

export function CourtGrid({
  courts,
  matches,
  selectedMatch,
  onAssign,
  onClear,
}: CourtGridProps) {
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
              !isEmpty && "bg-card"
            )}
          >
            {/* Court Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">{court.name}</h3>
                <Badge
                  variant={isEmpty ? "secondary" : "default"}
                  className="mt-1"
                >
                  {isEmpty ? "Available" : match.status}
                </Badge>
              </div>
              {!isEmpty && (
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
                    Round {match.round} • Match {match.sequence}
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
