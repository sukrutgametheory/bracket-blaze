"use client"

import { useState } from "react"
import { Participant } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ParticipantDialog } from "./participant-dialog"
import { deleteParticipant } from "@/lib/actions/participants"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ParticipantListProps {
  participants: Participant[]
  tournamentId: string
  userId: string
}

export function ParticipantList({ participants, tournamentId, userId }: ParticipantListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const handleAdd = () => {
    setSelectedParticipant(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (participant: Participant) => {
    setSelectedParticipant(participant)
    setIsDialogOpen(true)
  }

  const handleDelete = async (participantId: string) => {
    if (!confirm("Are you sure you want to delete this participant? This will also remove them from all entries.")) {
      return
    }

    setIsDeleting(participantId)
    try {
      const result = await deleteParticipant(participantId)

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
        description: "Participant deleted successfully",
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete participant",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                Manage players and teams registered for this tournament
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>Add Participant</Button>
          </div>
        </CardHeader>
        <CardContent>
          {participants.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No participants have been added yet
              </p>
              <Button onClick={handleAdd}>Add Your First Participant</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-semibold text-lg">{participant.display_name}</p>
                      {participant.club && (
                        <Badge variant="outline">{participant.club}</Badge>
                      )}
                      {!participant.player_id && (
                        <Badge variant="destructive" className="text-xs">Needs phone</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {participant.phone && (
                        <span className="font-mono">{participant.phone}</span>
                      )}
                      {participant.email && <span>{participant.email}</span>}
                      <span>Added {new Date(participant.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(participant)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(participant.id)}
                      disabled={isDeleting === participant.id}
                    >
                      {isDeleting === participant.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ParticipantDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        participant={selectedParticipant}
        tournamentId={tournamentId}
      />
    </div>
  )
}
