"use client"

import { useState } from "react"
import { Tournament, Court, Division, type GameScore, type WinnerSide } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReadyQueue } from "./ready-queue"
import { CourtGrid } from "./court-grid"
import { RoundManagement } from "./round-management"
import { StandingsSection } from "./standings-section"
import { ResultsSection } from "./results-section"
import { MatchResultDialog } from "./match-result-dialog"
import { assignMatchToCourt, clearCourt } from "@/lib/actions/court-assignments"
import { startMatch, completeMatch, recordWalkover, editMatchScore, approveMatch, rejectMatch } from "@/lib/actions/matches"
import { generateNextSwissRound, generateKnockoutDraw } from "@/lib/actions/draws"
import { generateScoringToken } from "@/lib/actions/scoring-token"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import type { RankedStanding } from "@/lib/services/standings-engine"

interface ControlCenterClientProps {
  tournament: Tournament
  courts: Court[]
  divisions: Division[]
  matches: any[]
  draws: { division_id: string; state_json: any }[]
  standings: Record<string, RankedStanding[]>
  entries: any[]
}

export function ControlCenterClient({
  tournament,
  courts,
  divisions,
  matches,
  draws,
  standings,
  entries,
}: ControlCenterClientProps) {
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    match: any | null
    mode: 'record' | 'edit'
  }>({ open: false, match: null, mode: 'record' })
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
    setResultDialog({ open: true, match, mode: 'record' })
  }

  const handleOpenEditDialog = (match: any) => {
    setResultDialog({ open: true, match, mode: 'edit' })
  }

  const handleSubmitResult = async (matchId: string, winnerSide: WinnerSide, games: GameScore[]) => {
    const action = resultDialog.mode === 'edit' ? editMatchScore : completeMatch
    const result = await action(matchId, winnerSide, games)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    const title = resultDialog.mode === 'edit' ? "Score Updated" : "Result Recorded"
    toast({ title, description: result.message })
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

  const handleApproveMatch = async (matchId: string) => {
    const result = await approveMatch(matchId)
    if ('error' in result && result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Match Approved", description: "Match approved and completed" })
    router.refresh()
  }

  const handleRejectMatch = async (matchId: string, note?: string) => {
    const result = await rejectMatch(matchId, note)
    if ('error' in result && result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    toast({ title: "Match Rejected", description: "Referee can continue scoring" })
    router.refresh()
  }

  const handleGenerateScoringToken = async () => {
    if (tournament.scoring_token) {
      if (!confirm("Regenerate scoring link? This will invalidate the current link.")) return
    }

    const result = await generateScoringToken(tournament.id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }

    const url = `${window.location.origin}/score/${result.token}`
    await navigator.clipboard.writeText(url)
    toast({ title: "Scoring Link Generated", description: "URL copied to clipboard" })
    router.refresh()
  }

  const pendingSignoffCount = matches.filter(m => m.status === 'pending_signoff').length

  return (
    <div className="space-y-6">
      {/* Token Management */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateScoringToken}
        >
          {tournament.scoring_token ? "Regenerate Scoring Link" : "Generate Scoring Link"}
        </Button>
        {tournament.scoring_token && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/score/${tournament.scoring_token}`
                navigator.clipboard.writeText(url)
                toast({ title: "Referee Link Copied", description: url })
              }}
            >
              Copy Referee Link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/tv/${tournament.id}`
                navigator.clipboard.writeText(url)
                toast({ title: "Court TV Link Copied", description: url })
              }}
            >
              Copy Court TV Link
            </Button>
          </>
        )}
        {pendingSignoffCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-medium">
            {pendingSignoffCount} pending sign-off
          </span>
        )}
      </div>

      {/* Round Management Panel */}
      <RoundManagement
        divisions={divisions}
        matches={matches}
        draws={draws}
        onGenerateNextRound={handleGenerateNextRound}
        onGenerateKnockout={handleGenerateKnockout}
      />

      <Tabs defaultValue="courts">
        <TabsList>
          <TabsTrigger value="courts">Courts</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="courts" className="mt-4">
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
                    onApproveMatch={handleApproveMatch}
                    onRejectMatch={handleRejectMatch}
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
        </TabsContent>

        <TabsContent value="standings" className="mt-4">
          <StandingsSection
            divisions={divisions}
            standings={standings}
            draws={draws}
            entries={entries}
          />
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <ResultsSection
            divisions={divisions}
            matches={matches}
            entries={entries}
            onEditScore={handleOpenEditDialog}
          />
        </TabsContent>
      </Tabs>

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
          mode={resultDialog.mode}
          initialGames={resultDialog.mode === 'edit' ? resultDialog.match.meta_json?.games : undefined}
          initialWalkover={resultDialog.mode === 'edit' ? resultDialog.match.meta_json?.walkover : undefined}
        />
      )}
    </div>
  )
}
