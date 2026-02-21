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

export function ResultsSection({
  divisions,
  matches,
  entries,
  onEditScore,
}: ResultsSectionProps) {
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

  // Derive available rounds
  const rounds = [...new Set(completedMatches.map(m => m.round))].sort((a, b) => a - b)

  // Apply round filter
  const filteredMatches = roundFilter === "all"
    ? completedMatches
    : completedMatches.filter(m => m.round === parseInt(roundFilter))

  const entryMap = new Map(entries.map(e => [e.id, e]))

  return (
    <div className="space-y-3">
      {/* Round filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Round:</span>
        <Select value={roundFilter} onValueChange={setRoundFilter}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rounds</SelectItem>
            {rounds.map(r => (
              <SelectItem key={r} value={String(r)}>Round {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results grouped by division */}
      {divisions.map((division) => {
        const divMatches = filteredMatches
          .filter(m => m.division_id === division.id)
          .sort((a: any, b: any) => {
            if (a.round !== b.round) return a.round - b.round
            return a.sequence - b.sequence
          })

        if (divMatches.length === 0) return null

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
                    <TableHead className="w-16">Match</TableHead>
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

                    return (
                      <TableRow key={match.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          R{match.round} M{match.sequence}
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
