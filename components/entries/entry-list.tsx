"use client"

import { useState } from "react"
import { Division, Participant } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EntryDialog } from "./entry-dialog"
import { deleteEntry } from "@/lib/actions/entries"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface EntryWithParticipant {
  id: string
  division_id: string
  participant_id: string
  seed: number | null
  status: string
  created_at: string
  participant: Participant
}

interface EntryListProps {
  entries: EntryWithParticipant[]
  division: Division
  participants: Participant[]
  tournamentId: string
  userId: string
}

export function EntryList({ entries, division, participants, tournamentId, userId }: EntryListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<EntryWithParticipant | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const handleAdd = () => {
    setSelectedEntry(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (entry: EntryWithParticipant) => {
    setSelectedEntry(entry)
    setIsDialogOpen(true)
  }

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

  // Get participant IDs already in this division
  const enteredParticipantIds = new Set(entries.map(e => e.participant_id))

  // Filter available participants (not already entered)
  const availableParticipants = participants.filter(p => !enteredParticipantIds.has(p.id))

  const entriesCount = entries.length
  const drawSize = division.draw_size

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Entries ({entriesCount}/{drawSize})
              </CardTitle>
              <CardDescription>
                Participants registered for this division
              </CardDescription>
            </div>
            <Button
              onClick={handleAdd}
              disabled={entriesCount >= drawSize}
            >
              {entriesCount >= drawSize ? "Division Full" : "Add Entry"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No participants have been added to this division yet
              </p>
              <Button onClick={handleAdd}>Add First Entry</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
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
                          {entry.participant.display_name}
                        </p>
                        {entry.participant.club && (
                          <Badge variant="outline">{entry.participant.club}</Badge>
                        )}
                        {entry.status === "withdrawn" && (
                          <Badge variant="destructive">Withdrawn</Badge>
                        )}
                        {entry.status === "late_add" && (
                          <Badge variant="secondary">Late Add</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Added {new Date(entry.created_at).toLocaleDateString()}
                      </p>
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(entry.id, entry.participant.display_name)}
                      disabled={isDeleting === entry.id}
                    >
                      {isDeleting === entry.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              ))}
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
        tournamentId={tournamentId}
      />
    </div>
  )
}
