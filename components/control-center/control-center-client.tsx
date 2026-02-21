"use client"

import { useState } from "react"
import { Tournament, Court, Division, type GameScore, type WinnerSide } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReadyQueue } from "./ready-queue"
import { CourtGrid } from "./court-grid"
import { RoundManagement } from "./round-management"
import { MatchResultDialog } from "./match-result-dialog"
import { assignMatchToCourt, clearCourt } from "@/lib/actions/court-assignments"
import { startMatch, completeMatch, recordWalkover } from "@/lib/actions/matches"
import { generateNextSwissRound, generateKnockoutDraw } from "@/lib/actions/draws"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ControlCenterClientProps {
  tournament: Tournament
  courts: Court[]
  divisions: Division[]
  matches: any[]
  draws: { division_id: string; state_json: any }[]
}

export function ControlCenterClient({
  tournament,
  courts,
  divisions,
  matches,
  draws,
}: ControlCenterClientProps) {
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    match: any | null
  }>({ open: false, match: null })
  const { toast } = useToast()
  const router = useRouter()

  // Separate matches into assigned and unassigned
  // Unassigned: no court, scheduled status, not a completed bye
  const unassignedMatches = matches.filter(
    m => !m.court_id && m.status === 'scheduled' && m.side_b_entry_id !== null
  )
  const assignedMatches = matches.filter(
    m => m.court_id && m.status !== 'completed' && m.status !== 'walkover'
  )

  // Sort unassigned by priority (round, then division priority, then sequence)
  const prioritizedMatches = [...unassignedMatches].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    const aPriority = a.division?.scheduling_priority || 5
    const bPriority = b.division?.scheduling_priority || 5
    if (aPriority !== bPriority) return bPriority - aPriority
    return a.sequence - b.sequence
  })

  const handleAssignToCourt = async (matchId: string, courtId: string) => {
    const result = await assignMatchToCourt(matchId, courtId)

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    if (result.warnings && result.warnings.length > 0) {
      const warningMessages = result.warnings.join("\n")
      const confirmed = confirm(
        `Warnings detected:\n\n${warningMessages}\n\nDo you want to proceed anyway?`
      )
      if (!confirmed) return

      const overrideResult = await assignMatchToCourt(
        matchId, courtId, true, "TD override - proceed despite warnings"
      )
      if (overrideResult.error) {
        toast({ title: "Error", description: overrideResult.error, variant: "destructive" })
        return
      }
    }

    toast({ title: "Match Assigned", description: result.message })
    setSelectedMatch(null)
    router.refresh()
  }

  const handleClearCourt = async (courtId: string) => {
    const court = courts.find(c => c.id === courtId)
    if (!confirm(`Clear ${court?.name}? This will unassign the current match.`)) return

    const result = await clearCourt(courtId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Court Cleared", description: result.message })
    router.refresh()
  }

  const handleStartMatch = async (matchId: string) => {
    const result = await startMatch(matchId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Match Started", description: result.message })
    router.refresh()
  }

  const handleOpenResultDialog = (match: any) => {
    setResultDialog({ open: true, match })
  }

  const handleSubmitResult = async (matchId: string, winnerSide: WinnerSide, games: GameScore[]) => {
    const result = await completeMatch(matchId, winnerSide, games)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Result Recorded", description: result.message })
    router.refresh()
  }

  const handleSubmitWalkover = async (matchId: string, winnerSide: WinnerSide) => {
    const result = await recordWalkover(matchId, winnerSide)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Walkover Recorded", description: result.message })
    router.refresh()
  }

  const handleGenerateNextRound = async (divisionId: string) => {
    const result = await generateNextSwissRound(divisionId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Next Round Generated", description: result.message })
    router.refresh()
  }

  const handleGenerateKnockout = async (divisionId: string) => {
    const result = await generateKnockoutDraw(divisionId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Knockout Bracket Generated", description: result.message })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Round Management Panel */}
      <RoundManagement
        divisions={divisions}
        matches={matches}
        draws={draws}
        onGenerateNextRound={handleGenerateNextRound}
        onGenerateKnockout={handleGenerateKnockout}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Court Grid - 2/3 width on large screens */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Courts ({courts.length})</CardTitle>
              <CardDescription>
                Click a court to assign the selected match
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CourtGrid
                courts={courts}
                matches={assignedMatches}
                selectedMatch={selectedMatch}
                onAssign={handleAssignToCourt}
                onClear={handleClearCourt}
                onStartMatch={handleStartMatch}
                onRecordResult={handleOpenResultDialog}
              />
            </CardContent>
          </Card>
        </div>

        {/* Ready Queue - 1/3 width on large screens */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Ready Queue ({prioritizedMatches.length})</CardTitle>
              <CardDescription>
                Select a match to assign to a court
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReadyQueue
                matches={prioritizedMatches}
                selectedMatch={selectedMatch}
                onSelectMatch={setSelectedMatch}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Match Result Dialog */}
      {resultDialog.match && (
        <MatchResultDialog
          open={resultDialog.open}
          onOpenChange={(open) => setResultDialog({ ...resultDialog, open })}
          matchId={resultDialog.match.id}
          sideAName={resultDialog.match.side_a?.participant?.display_name || "Side A"}
          sideBName={resultDialog.match.side_b?.participant?.display_name || "Side B"}
          onSubmitResult={handleSubmitResult}
          onSubmitWalkover={handleSubmitWalkover}
        />
      )}
    </div>
  )
}
