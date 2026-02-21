"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { Division } from "@/types/database"
import type { RankedStanding } from "@/lib/services/standings-engine"

interface EntryInfo {
  id: string
  seed: number | null
  participant: { display_name: string; club: string | null } | null
}

interface DrawState {
  current_round: number
  total_rounds: number
  qualifiers: number
  phase: string
}

interface StandingsSectionProps {
  divisions: Division[]
  standings: Record<string, RankedStanding[]>
  draws: { division_id: string; state_json: any }[]
  entries: EntryInfo[]
}

export function StandingsSection({
  divisions,
  standings,
  draws,
  entries,
}: StandingsSectionProps) {
  if (divisions.length === 0) return null

  const drawMap = new Map(draws.map(d => [d.division_id, d.state_json as DrawState]))
  const entryMap = new Map(entries.map(e => [e.id, e]))

  return (
    <div className="space-y-3">
      {divisions.map((division) => {
        const drawState = drawMap.get(division.id)
        if (!drawState) return null

        const divStandings = standings[division.id] || []
        const isKnockout = drawState.phase === 'knockout'
        const qualifierCount = drawState.qualifiers || 0
        const currentRound = drawState.current_round || 1
        const totalRounds = drawState.total_rounds || 5

        return (
          <Card key={division.id} className="border">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {division.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {isKnockout
                      ? "Knockout Phase"
                      : `Standings after R${currentRound} of ${totalRounds}`
                    }
                  </span>
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="py-2 px-4">
              {isKnockout ? (
                <p className="text-sm text-muted-foreground py-2">
                  Knockout bracket in progress — Swiss standings are final.
                </p>
              ) : divStandings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No matches completed yet
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-16 text-center">W-L</TableHead>
                      <TableHead className="w-14 text-right">PF</TableHead>
                      <TableHead className="w-14 text-right">PA</TableHead>
                      <TableHead className="w-14 text-right">Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {divStandings.map((standing) => {
                      const entry = entryMap.get(standing.entry_id)
                      const diff = standing.points_for - standing.points_against
                      const isQualifier = qualifierCount > 0 && standing.rank <= qualifierCount
                      const isQualifierCutoff = qualifierCount > 0 && standing.rank === qualifierCount

                      return (
                        <TableRow
                          key={standing.entry_id}
                          className={cn(
                            isQualifierCutoff && "border-b-2 border-dashed border-primary/40"
                          )}
                        >
                          <TableCell className="text-center font-medium">
                            <span className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                              isQualifier
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-muted-foreground"
                            )}>
                              {standing.rank}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">
                                {entry?.participant?.display_name || "Unknown"}
                              </span>
                              {entry?.participant?.club && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  {entry.participant.club}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {standing.wins}-{standing.losses}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {standing.points_for}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {standing.points_against}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right text-sm font-medium tabular-nums",
                            diff > 0 && "text-green-600 dark:text-green-400",
                            diff < 0 && "text-red-600 dark:text-red-400"
                          )}>
                            {diff > 0 ? `+${diff}` : diff}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              {qualifierCount > 0 && divStandings.length > 0 && !isKnockout && (
                <p className="text-xs text-muted-foreground mt-2 px-2">
                  Top {qualifierCount} qualify for knockout
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
