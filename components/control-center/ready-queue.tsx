"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getEntryDisplayName } from "@/lib/utils/display-name"

interface ReadyQueueProps {
  matches: any[]
  selectedMatch: string | null
  onSelectMatch: (matchId: string) => void
}

export function ReadyQueue({ matches, selectedMatch, onSelectMatch }: ReadyQueueProps) {
  if (matches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No matches waiting for court assignment</p>
        <p className="text-sm mt-2">All matches are either assigned or completed</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {matches.map((match) => {
        const sideA = match.side_a as any
        const sideB = match.side_b as any
        const isBye = !sideB
        const isSelected = selectedMatch === match.id

        return (
          <div
            key={match.id}
            onClick={() => onSelectMatch(match.id)}
            className={cn(
              "border rounded-lg p-3 cursor-pointer transition-colors",
              isSelected
                ? "bg-primary/10 border-primary"
                : "hover:bg-accent hover:border-accent-foreground/20"
            )}
          >
            {/* Division and Round */}
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                {match.division?.name}
              </Badge>
              <span className="text-xs text-muted-foreground">
                R{match.round} • M{match.sequence}
              </span>
            </div>

            {/* Players */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {sideA?.seed && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {sideA.seed}
                  </span>
                )}
                <span className="font-medium truncate">
                  {getEntryDisplayName(sideA)}
                </span>
              </div>

              {isBye ? (
                <div className="text-xs text-muted-foreground font-semibold">
                  BYE
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  {sideB?.seed && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      {sideB.seed}
                    </span>
                  )}
                  <span className="font-medium truncate">
                    {getEntryDisplayName(sideB)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
