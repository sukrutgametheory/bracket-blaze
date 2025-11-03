"use client"

import { useState } from "react"
import { Tournament, Court, Division } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReadyQueue } from "./ready-queue"
import { CourtGrid } from "./court-grid"
import { assignMatchToCourt, clearCourt } from "@/lib/actions/court-assignments"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ControlCenterClientProps {
  tournament: Tournament
  courts: Court[]
  divisions: Division[]
  matches: any[]
  userId: string
}

export function ControlCenterClient({
  tournament,
  courts,
  divisions,
  matches,
  userId,
}: ControlCenterClientProps) {
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  // Separate matches into assigned and unassigned
  const unassignedMatches = matches.filter(
    m => !m.court_id && m.status === 'scheduled'
  )
  const assignedMatches = matches.filter(m => m.court_id)

  // Sort unassigned by priority (round, then division priority, then sequence)
  const prioritizedMatches = [...unassignedMatches].sort((a, b) => {
    // First by round (lower round = higher priority)
    if (a.round !== b.round) return a.round - b.round

    // Then by division priority (higher = higher priority)
    const aPriority = a.division?.scheduling_priority || 5
    const bPriority = b.division?.scheduling_priority || 5
    if (aPriority !== bPriority) return bPriority - aPriority

    // Finally by sequence
    return a.sequence - b.sequence
  })

  const handleAssignToCourt = async (matchId: string, courtId: string) => {
    const result = await assignMatchToCourt(matchId, courtId, userId)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    if (result.warnings && result.warnings.length > 0) {
      // Show warnings but allow override
      const warningMessages = result.warnings.join("\n")
      const confirmed = confirm(
        `⚠️ Warnings detected:\n\n${warningMessages}\n\nDo you want to proceed anyway?`
      )

      if (!confirmed) {
        return
      }

      // Retry with override flag
      const overrideResult = await assignMatchToCourt(
        matchId,
        courtId,
        userId,
        true,
        "TD override - proceed despite warnings"
      )

      if (overrideResult.error) {
        toast({
          title: "Error",
          description: overrideResult.error,
          variant: "destructive",
        })
        return
      }
    }

    toast({
      title: "Match Assigned",
      description: result.message,
    })

    setSelectedMatch(null)
    router.refresh()
  }

  const handleClearCourt = async (courtId: string) => {
    const court = courts.find(c => c.id === courtId)
    if (!confirm(`Clear ${court?.name}? This will unassign the current match.`)) {
      return
    }

    const result = await clearCourt(courtId)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Court Cleared",
      description: result.message,
    })

    router.refresh()
  }

  return (
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
  )
}
