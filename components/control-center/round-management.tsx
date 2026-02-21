"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronRight, Trophy } from "lucide-react"
import type { Division } from "@/types/database"

interface DrawState {
  current_round: number
  total_rounds: number
  qualifiers: number
  phase: string
  bye_history: string[]
  bracket_size?: number
}

interface RoundManagementProps {
  divisions: Division[]
  matches: any[]
  draws: { division_id: string; state_json: any }[]
  onGenerateNextRound: (divisionId: string) => void
  onGenerateKnockout: (divisionId: string) => void
}

export function RoundManagement({
  divisions,
  matches,
  draws,
  onGenerateNextRound,
  onGenerateKnockout,
}: RoundManagementProps) {
  if (divisions.length === 0) {
    return null
  }

  const drawMap = new Map(draws.map(d => [d.division_id, d.state_json as DrawState]))

  return (
    <div className="space-y-3">
      {divisions.map((division) => {
        const drawState = drawMap.get(division.id)
        if (!drawState) return null

        const divMatches = matches.filter(m => m.division_id === division.id)
        const currentRound = drawState.current_round || 1
        const totalRounds = drawState.total_rounds || 5
        const phase = drawState.phase || 'swiss'

        // Count matches in current round
        const currentRoundMatches = divMatches.filter(
          m => m.round === currentRound && m.phase === 'swiss'
        )
        const completedInRound = currentRoundMatches.filter(
          m => m.status === 'completed' || m.status === 'walkover'
        ).length
        const totalInRound = currentRoundMatches.length

        const isCurrentRoundComplete = totalInRound > 0 && completedInRound === totalInRound
        const isSwissComplete = currentRound >= totalRounds && isCurrentRoundComplete
        const isKnockoutPhase = phase === 'knockout'

        // Knockout match tracking
        const knockoutMatches = divMatches.filter(m => m.phase === 'knockout')
        const completedKnockout = knockoutMatches.filter(
          m => m.status === 'completed' || m.status === 'walkover'
        ).length

        return (
          <Card key={division.id} className="border">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {division.name}
                  </Badge>
                  {isKnockoutPhase ? (
                    <span className="text-xs text-muted-foreground">
                      Knockout — {completedKnockout}/{knockoutMatches.length} matches
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Swiss R{currentRound} of {totalRounds} — {completedInRound}/{totalInRound} matches
                    </span>
                  )}
                </CardTitle>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {!isKnockoutPhase && isCurrentRoundComplete && !isSwissComplete && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onGenerateNextRound(division.id)}
                    >
                      <ChevronRight className="h-3 w-3 mr-1" />
                      Generate R{currentRound + 1}
                    </Button>
                  )}
                  {isSwissComplete && !isKnockoutPhase && drawState.qualifiers > 0 && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onGenerateKnockout(division.id)}
                    >
                      <Trophy className="h-3 w-3 mr-1" />
                      Generate Knockout
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Progress bar */}
            <CardContent className="py-2 px-4">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: totalInRound > 0 ? `${(completedInRound / totalInRound) * 100}%` : '0%'
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
