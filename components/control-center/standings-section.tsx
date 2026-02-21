"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { getEntryDisplayName } from "@/lib/utils/display-name"

interface EntryInfo {
  id: string
  seed: number | null
  participant: { display_name: string; club: string | null } | null
  team: { name: string } | null
}

interface DrawState {
  current_round: number
  total_rounds: number
  qualifiers: number
  phase: string
  bracket_size?: number
}

interface StandingsSectionProps {
  divisions: Division[]
  standings: Record<string, RankedStanding[]>
  draws: { division_id: string; state_json: any }[]
  entries: EntryInfo[]
  matches?: any[]
}

function getKnockoutRoundLabel(round: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - round
  if (roundsFromEnd === 0) return "Final"
  if (roundsFromEnd === 1) return "Semi-Final"
  if (roundsFromEnd === 2) return "Quarter-Final"
  return `Round of ${Math.pow(2, roundsFromEnd + 1)}`
}

function SwissStandingsTable({
  divStandings,
  entryMap,
  qualifierCount,
  isKnockout,
}: {
  divStandings: RankedStanding[]
  entryMap: Map<string, EntryInfo>
  qualifierCount: number
  isKnockout: boolean
}) {
  if (divStandings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No matches completed yet
      </p>
    )
  }

  return (
    <>
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
                      {entry ? getEntryDisplayName(entry) : "Unknown"}
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
      {qualifierCount > 0 && divStandings.length > 0 && !isKnockout && (
        <p className="text-xs text-muted-foreground mt-2 px-2">
          Top {qualifierCount} qualify for knockout
        </p>
      )}
    </>
  )
}

function KnockoutBracketView({
  divisionId,
  matches,
  entryMap,
}: {
  divisionId: string
  matches: any[]
  entryMap: Map<string, EntryInfo>
}) {
  const koMatches = matches
    .filter(m => m.division_id === divisionId && m.phase === "knockout")
    .sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round
      return a.sequence - b.sequence
    })

  if (koMatches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Knockout bracket not yet generated
      </p>
    )
  }

  const totalRounds = Math.max(...koMatches.map(m => m.round))

  // Group by round
  const roundGroups = new Map<number, any[]>()
  for (const m of koMatches) {
    const group = roundGroups.get(m.round) || []
    group.push(m)
    roundGroups.set(m.round, group)
  }

  return (
    <div className="space-y-4">
      {Array.from(roundGroups.entries()).map(([round, roundMatches]) => {
        const roundLabel = getKnockoutRoundLabel(round, totalRounds)

        return (
          <div key={round}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {roundLabel}
            </h4>
            <div className="space-y-1.5">
              {roundMatches.map((match: any) => {
                const sideA = match.side_a as any
                const sideB = match.side_b as any
                const nameA = getEntryDisplayName(sideA)
                const nameB = getEntryDisplayName(sideB)
                const isCompleted = match.status === "completed" || match.status === "walkover"
                const isWalkover = match.meta_json?.walkover === true
                const games = match.meta_json?.games || []
                const scoreStr = isWalkover
                  ? "W/O"
                  : games.length > 0
                  ? games.map((g: any) => `${g.score_a}-${g.score_b}`).join(", ")
                  : ""

                return (
                  <div
                    key={match.id}
                    className={cn(
                      "border rounded-md overflow-hidden text-sm",
                      isCompleted ? "border-border" : "border-dashed border-muted-foreground/30"
                    )}
                  >
                    {/* Side A */}
                    <div className={cn(
                      "flex items-center justify-between px-3 py-1.5",
                      isCompleted && match.winner_side === "A" && "bg-green-50 dark:bg-green-950/30",
                      isCompleted && match.winner_side === "B" && "bg-red-50/50 dark:bg-red-950/20"
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        {isCompleted && (
                          <span className={cn(
                            "text-[10px] font-bold w-4 shrink-0",
                            match.winner_side === "A"
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-500 dark:text-red-400"
                          )}>
                            {match.winner_side === "A" ? "W" : "L"}
                          </span>
                        )}
                        <span className={cn(
                          "truncate",
                          isCompleted && match.winner_side === "A" && "font-semibold",
                          !sideA && "text-muted-foreground italic"
                        )}>
                          {nameA}
                        </span>
                      </div>
                      {isCompleted && scoreStr && (
                        <span className="text-xs tabular-nums text-muted-foreground ml-2 shrink-0">
                          {games.map((g: any) => g.score_a).join(", ")}
                        </span>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/50" />

                    {/* Side B */}
                    <div className={cn(
                      "flex items-center justify-between px-3 py-1.5",
                      isCompleted && match.winner_side === "B" && "bg-green-50 dark:bg-green-950/30",
                      isCompleted && match.winner_side === "A" && "bg-red-50/50 dark:bg-red-950/20"
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        {isCompleted && (
                          <span className={cn(
                            "text-[10px] font-bold w-4 shrink-0",
                            match.winner_side === "B"
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-500 dark:text-red-400"
                          )}>
                            {match.winner_side === "B" ? "W" : "L"}
                          </span>
                        )}
                        <span className={cn(
                          "truncate",
                          isCompleted && match.winner_side === "B" && "font-semibold",
                          !sideB && "text-muted-foreground italic"
                        )}>
                          {nameB}
                        </span>
                      </div>
                      {isCompleted && scoreStr && (
                        <span className="text-xs tabular-nums text-muted-foreground ml-2 shrink-0">
                          {games.map((g: any) => g.score_b).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function StandingsSection({
  divisions,
  standings,
  draws,
  entries,
  matches = [],
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
        const isKnockout = drawState.phase === "knockout"
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
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="py-2 px-4">
              {isKnockout ? (
                <Tabs defaultValue="knockout">
                  <TabsList className="h-8">
                    <TabsTrigger value="knockout" className="text-xs">
                      Knockout Bracket
                    </TabsTrigger>
                    <TabsTrigger value="swiss" className="text-xs">
                      Swiss Standings
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="knockout" className="mt-3">
                    <KnockoutBracketView
                      divisionId={division.id}
                      matches={matches}
                      entryMap={entryMap}
                    />
                  </TabsContent>

                  <TabsContent value="swiss" className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      Final Swiss standings (after {totalRounds} rounds)
                    </p>
                    <SwissStandingsTable
                      divStandings={divStandings}
                      entryMap={entryMap}
                      qualifierCount={qualifierCount}
                      isKnockout={true}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Standings after Round {currentRound} of {totalRounds}
                  </p>
                  <SwissStandingsTable
                    divStandings={divStandings}
                    entryMap={entryMap}
                    qualifierCount={qualifierCount}
                    isKnockout={false}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
