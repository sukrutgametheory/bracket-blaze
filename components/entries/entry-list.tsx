"use client"

import { useState } from "react"
import { Division, Participant } from "@/types/database"
import type { SwissRepairWindowStatus } from "@/lib/services/swiss-repair"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EntryDialog } from "./entry-dialog"
import { deleteEntry, revokeEntry } from "@/lib/actions/entries"
import { getEntryDisplayName } from "@/lib/utils/display-name"
import { generateDraw, deleteAllMatches } from "@/lib/actions/draws"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface EntryWithParticipant {
  id: string
  division_id: string
  participant_id: string | null
  team_id: string | null
  seed: number | null
  status: string
  created_at: string
  participant: Participant | null
  team?: { id: string; name: string; members?: { participant: Participant }[] } | null
}

interface EntryListProps {
  entries: EntryWithParticipant[]
  division: Division
  participants: Participant[]
  tournamentId: string
  repairWindowStatus: SwissRepairWindowStatus | null
}

export function EntryList({
  entries,
  division,
  participants,
  tournamentId,
  repairWindowStatus,
}: EntryListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<EntryWithParticipant | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeletingDraw, setIsDeletingDraw] = useState(false)
  const [dialogMode, setDialogMode] = useState<"standard" | "late_add">("standard")
  const { toast } = useToast()
  const router = useRouter()

  const handleAdd = () => {
    setSelectedEntry(null)
    setDialogMode("standard")
    setIsDialogOpen(true)
  }

  const handleAddLateAdd = () => {
    setSelectedEntry(null)
    setDialogMode("late_add")
    setIsDialogOpen(true)
  }

  const handleEdit = (entry: EntryWithParticipant) => {
    setSelectedEntry(entry)
    setIsDialogOpen(true)
  }

  const isDoubles = division.play_mode === "doubles"
  const isSwissRepairWindow = division.format === "swiss" && !!repairWindowStatus?.available
  const competitionEntriesCount = entries.filter((entry) => entry.status !== "withdrawn").length
  const withdrawnCount = entries.filter((entry) => entry.status === "withdrawn").length
  const canAddLateAdd = isSwissRepairWindow && competitionEntriesCount < division.draw_size

  const handleDelete = async (entryId: string, participantName: string) => {
    if (!confirm(`Are you sure you want to remove ${participantName} from this division?`)) {
      return
    }

    setIsDeleting(entryId)
    try {
      const result = await deleteEntry(entryId)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success",
        description: `${participantName} removed from division`,
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove entry",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const handleRevoke = async (entryId: string, participantName: string) => {
    if (!confirm(`Revoke ${participantName} from this Swiss division? Their Round 1 match will remain in results history, but they will be excluded from future draws.`)) {
      return
    }

    setIsDeleting(entryId)
    try {
      const result = await revokeEntry(entryId)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Entry Revoked",
        description: `${participantName} has been removed from future Swiss rounds`,
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke entry",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const handleGenerateDraw = async () => {
    if (!confirm(`Generate draw for ${division.name}? This will create Round 1 matches based on seeding.`)) {
      return
    }

    setIsGenerating(true)
    try {
      const result = await generateDraw(division.id)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Draw Generated!",
        description: result.message,
      })
      router.refresh()
      // Redirect to matches page
      router.push(`/tournaments/${tournamentId}/divisions/${division.id}/matches`)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate draw",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteDraw = async () => {
    if (!confirm("Delete all matches? This cannot be undone.")) {
      return
    }

    setIsDeletingDraw(true)
    try {
      const result = await deleteAllMatches(division.id)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success",
        description: "All matches deleted",
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete matches",
        variant: "destructive",
      })
    } finally {
      setIsDeletingDraw(false)
    }
  }

  // Get participant IDs already in this division (singles or as team members)
  const enteredParticipantIds = new Set<string>()
  entries.forEach(e => {
    if (e.participant_id) {
      enteredParticipantIds.add(e.participant_id)
    }
    if (e.team?.members) {
      e.team.members.forEach(m => {
        if (m.participant?.id) {
          enteredParticipantIds.add(m.participant.id)
        }
      })
    }
  })

  // Filter available participants (not already entered)
  const availableParticipants = participants.filter(p => !enteredParticipantIds.has(p.id))

  const entriesCount = competitionEntriesCount
  const drawSize = division.draw_size
  const canGenerateDraw = entriesCount >= 2 && !division.is_published

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Entries ({entriesCount}/{drawSize})
                {division.is_published && (
                  <Badge variant="default" className="ml-2">Draw Published</Badge>
                )}
                {withdrawnCount > 0 && (
                  <Badge variant="outline" className="ml-2">{withdrawnCount} Withdrawn</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isDoubles ? "Teams" : "Participants"} registered for this division
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {division.is_published ? (
                <>
                  <Button asChild variant="default">
                    <Link href={`/tournaments/${tournamentId}/divisions/${division.id}/matches`}>
                      View Matches
                    </Link>
                  </Button>
                  {canAddLateAdd && (
                    <Button variant="outline" onClick={handleAddLateAdd}>
                      {isDoubles ? "Add Late Add Team" : "Add Late Add"}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={handleDeleteDraw}
                    disabled={isDeletingDraw}
                  >
                    {isDeletingDraw ? "Deleting..." : "Delete Draw"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleAdd}
                    disabled={entriesCount >= drawSize}
                    variant="outline"
                  >
                    {entriesCount >= drawSize ? "Division Full" : isDoubles ? "Add Team" : "Add Entry"}
                  </Button>
                  <Button
                    onClick={handleGenerateDraw}
                    disabled={!canGenerateDraw || isGenerating}
                    variant="default"
                  >
                    {isGenerating ? "Generating..." : "Generate Draw"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {division.is_published && division.format === "swiss" && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">
                {isSwissRepairWindow
                  ? "Swiss repair window is open"
                  : "Swiss repair window is closed"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSwissRepairWindow
                  ? "You can revoke misclassified entries and optionally add a swing late add before Round 2 is generated."
                  : repairWindowStatus?.reason || "Repair actions are unavailable for this division right now."}
              </p>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No {isDoubles ? "teams have" : "participants have"} been added to this division yet
              </p>
              <Button
                onClick={division.is_published ? handleAddLateAdd : handleAdd}
                disabled={division.is_published && !canAddLateAdd}
              >
                {division.is_published
                  ? isDoubles
                    ? "Add First Late Add Team"
                    : "Add First Late Add"
                  : isDoubles
                    ? "Add First Team"
                    : "Add First Entry"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const displayName = getEntryDisplayName(entry)
                const club = entry.participant?.club
                const teamMembers = entry.team?.members

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      {entry.seed && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                          {entry.seed}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-lg">
                            {displayName}
                          </p>
                          {club && (
                            <Badge variant="outline">{club}</Badge>
                          )}
                          {isDoubles && (
                            <Badge variant="secondary">Doubles</Badge>
                          )}
                          {entry.status === "withdrawn" && (
                            <Badge variant="destructive">Withdrawn</Badge>
                          )}
                          {entry.status === "late_add" && (
                            <Badge variant="secondary">Late Add</Badge>
                          )}
                        </div>
                        {teamMembers && teamMembers.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {teamMembers.map(m => m.participant?.display_name).filter(Boolean).join(" & ")}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Added {new Date(entry.created_at).toLocaleDateString()}
                        </p>
                        {entry.status === "late_add" && (
                          <p className="text-sm text-muted-foreground">
                            Starts Round 2 at 0-1
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(entry)}
                      >
                        Edit Seed
                      </Button>
                      {!division.is_published && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(entry.id, displayName)}
                          disabled={isDeleting === entry.id}
                        >
                          {isDeleting === entry.id ? "Removing..." : "Remove"}
                        </Button>
                      )}
                      {division.is_published && isSwissRepairWindow && entry.status !== "withdrawn" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(entry.id, displayName)}
                          disabled={isDeleting === entry.id}
                        >
                          {isDeleting === entry.id ? "Revoking..." : "Revoke"}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        entry={selectedEntry}
        division={division}
        availableParticipants={availableParticipants}
        mode={dialogMode}
      />
    </div>
  )
}
