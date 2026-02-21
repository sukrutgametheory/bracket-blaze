"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Pencil } from "lucide-react"
import type { Division, MatchScoreData } from "@/types/database"

interface EntryInfo {
  id: string
  seed: number | null
  participant: { display_name: string; club: string | null } | null
}

interface ResultsSectionProps {
  divisions: Division[]
  matches: any[]
  entries: EntryInfo[]
  onEditScore: (match: any) => void
}

function formatScore(metaJson: any): string {
  const data = metaJson as MatchScoreData | null
  if (!data) return "—"
  if (data.walkover) return "W/O"
  if (!data.games || data.games.length === 0) return "—"
  return data.games.map(g => `${g.score_a}-${g.score_b}`).join(", ")
}

function getKnockoutRoundLabel(round: number, totalKnockoutRounds: number): string {
  const roundsFromEnd = totalKnockoutRounds - round
  if (roundsFromEnd === 0) return "Final"
  if (roundsFromEnd === 1) return "Semi-Final"
  if (roundsFromEnd === 2) return "Quarter-Final"
  return `Round of ${Math.pow(2, roundsFromEnd + 1)}`
}

export function ResultsSection({
  divisions,
  matches,
  entries,
  onEditScore,
}: ResultsSectionProps) {
  const [phaseFilter, setPhaseFilter] = useState<string>("all")
  const [roundFilter, setRoundFilter] = useState<string>("all")

  const completedMatches = matches.filter(
    m => (m.status === "completed" || m.status === "walkover") && m.side_b_entry_id !== null
  )

  if (completedMatches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No completed matches yet</p>
      </div>
    )
  }

  // Check if knockout matches exist
  const hasSwiss = completedMatches.some(m => m.phase === "swiss")
  const hasKnockout = completedMatches.some(m => m.phase === "knockout")

  // Apply phase filter
  const phaseFiltered = phaseFilter === "all"
    ? completedMatches
    : completedMatches.filter(m => m.phase === phaseFilter)

  // Derive available rounds from phase-filtered matches
  const rounds = [...new Set(phaseFiltered.map(m => m.round))].sort((a, b) => a - b)

  // Apply round filter
  const filteredMatches = roundFilter === "all"
    ? phaseFiltered
    : phaseFiltered.filter(m => m.round === parseInt(roundFilter))

  // Reset round filter when phase changes and selected round doesn't exist
  const effectiveRoundFilter = roundFilter !== "all" && !rounds.includes(parseInt(roundFilter))
    ? "all"
    : roundFilter

  const entryMap = new Map(entries.map(e => [e.id, e]))

  // Compute total knockout rounds per division for round labels
  const knockoutRoundsMap = new Map<string, number>()
  if (hasKnockout) {
    for (const div of divisions) {
      const koMatches = completedMatches.filter(m => m.division_id === div.id && m.phase === "knockout")
      if (koMatches.length > 0) {
        const maxRound = Math.max(...koMatches.map(m => m.round))
        knockoutRoundsMap.set(div.id, maxRound)
      }
    }
    // Also check scheduled knockout matches for total rounds
    const allKoMatches = matches.filter(m => m.phase === "knockout")
    for (const m of allKoMatches) {
      const current = knockoutRoundsMap.get(m.division_id) || 0
      if (m.round > current) knockoutRoundsMap.set(m.division_id, m.round)
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-4">
        {hasSwiss && hasKnockout && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Phase:</span>
            <Select
              value={phaseFilter}
              onValueChange={(v) => {
                setPhaseFilter(v)
                setRoundFilter("all")
              }}
            >
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Phases</SelectItem>
                <SelectItem value="swiss">Swiss</SelectItem>
                <SelectItem value="knockout">Knockout</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Round:</span>
          <Select value={effectiveRoundFilter} onValueChange={setRoundFilter}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rounds</SelectItem>
              {rounds.map(r => {
                // For knockout phase filter, show knockout labels
                const isKoRound = phaseFilter === "knockout" ||
                  (phaseFilter === "all" && phaseFiltered.some(m => m.round === r && m.phase === "knockout"))
                const label = isKoRound && phaseFilter === "knockout"
                  ? (() => {
                    // Find total knockout rounds from any division
                    const totalKo = Math.max(...Array.from(knockoutRoundsMap.values()), 1)
                    return getKnockoutRoundLabel(r, totalKo)
                  })()
                  : `Round ${r}`
                return (
                  <SelectItem key={r} value={String(r)}>{label}</SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results grouped by division */}
      {divisions.map((division) => {
        const divMatches = (effectiveRoundFilter === "all"
          ? phaseFiltered
          : phaseFiltered.filter(m => m.round === parseInt(effectiveRoundFilter))
        )
          .filter(m => m.division_id === division.id)
          .sort((a: any, b: any) => {
            // Sort by round first
            if (a.round !== b.round) return a.round - b.round
            // Then by phase (swiss before knockout for same round number)
            if (a.phase !== b.phase) return a.phase === "swiss" ? -1 : 1
            // Then by actual_end_time if available
            if (a.actual_end_time && b.actual_end_time) {
              return new Date(a.actual_end_time).getTime() - new Date(b.actual_end_time).getTime()
            }
            // Fallback to sequence
            return a.sequence - b.sequence
          })

        if (divMatches.length === 0) return null

        const totalKoRounds = knockoutRoundsMap.get(division.id) || 1

        return (
          <Card key={division.id} className="border">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">
                <Badge variant="outline" className="text-xs">
                  {division.name}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="py-2 px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Round</TableHead>
                    <TableHead>Side A</TableHead>
                    <TableHead className="w-24 text-center">Score</TableHead>
                    <TableHead>Side B</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divMatches.map((match: any) => {
                    const sideA = match.side_a as any
                    const sideB = match.side_b as any
                    const nameA = sideA?.participant?.display_name || "TBD"
                    const nameB = sideB?.participant?.display_name || "TBD"
                    const isWalkover = (match.meta_json as MatchScoreData)?.walkover === true
                    const score = formatScore(match.meta_json)
                    const isKnockout = match.phase === "knockout"

                    const roundLabel = isKnockout
                      ? getKnockoutRoundLabel(match.round, totalKoRounds)
                      : `Round ${match.round}`

                    return (
                      <TableRow key={match.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {isKnockout && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                KO
                              </Badge>
                            )}
                            <span>{roundLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-sm",
                            match.winner_side === "A" && "font-semibold"
                          )}>
                            {nameA}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isWalkover ? (
                            <Badge variant="secondary" className="text-xs">W/O</Badge>
                          ) : (
                            <span className="text-sm tabular-nums">{score}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-sm",
                            match.winner_side === "B" && "font-semibold"
                          )}>
                            {nameB}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEditScore(match)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
