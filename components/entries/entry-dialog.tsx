"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Division, Participant } from "@/types/database"
import { createEntry, createDoubleEntry, updateEntry } from "@/lib/actions/entries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"

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

interface EntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: EntryWithParticipant | null
  division: Division
  availableParticipants: Participant[]
  tournamentId: string
}

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  division,
  availableParticipants,
  tournamentId,
}: EntryDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("")
  const [selectedParticipantId2, setSelectedParticipantId2] = useState<string>("")
  const [seed, setSeed] = useState<string>("")
  const [multiDivisionWarning, setMultiDivisionWarning] = useState<string[]>([])

  const isDoubles = division.play_mode === "doubles"

  // Update form when entry changes
  useEffect(() => {
    if (entry) {
      setSelectedParticipantId(entry.participant_id || "")
      setSeed(entry.seed?.toString() || "")
    } else {
      setSelectedParticipantId("")
      setSelectedParticipantId2("")
      setSeed("")
    }
    setMultiDivisionWarning([])
  }, [entry, open])

  // Filter available participants for doubles (exclude the other selected player)
  const availableForPlayer1 = isDoubles
    ? availableParticipants.filter(p => p.id !== selectedParticipantId2)
    : availableParticipants
  const availableForPlayer2 = isDoubles
    ? availableParticipants.filter(p => p.id !== selectedParticipantId)
    : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    try {
      const seedNumber = seed ? parseInt(seed) : null

      if (entry) {
        // Update existing entry (only seed can be updated)
        const result = await updateEntry(entry.id, seedNumber)

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
          description: "Entry seed updated successfully",
        })
      } else if (isDoubles) {
        // Create doubles entry
        if (!selectedParticipantId || !selectedParticipantId2) {
          toast({
            title: "Error",
            description: "Please select both players for the doubles team",
            variant: "destructive",
          })
          return
        }

        const result = await createDoubleEntry(
          division.id,
          selectedParticipantId,
          selectedParticipantId2,
          seedNumber
        )

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
          description: "Doubles team added to division",
        })
      } else {
        // Create singles entry
        if (!selectedParticipantId) {
          toast({
            title: "Error",
            description: "Please select a participant",
            variant: "destructive",
          })
          return
        }

        const result = await createEntry(
          division.id,
          selectedParticipantId,
          seedNumber
        )

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
          description: "Participant added to division",
        })
      }

      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit Entry Seed" : isDoubles ? "Add Doubles Team" : "Add Entry to Division"}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `Update seeding for ${entry.participant?.display_name || entry.team?.name}`
              : isDoubles
              ? `Select two players to form a doubles team in ${division.name}`
              : `Add a participant to ${division.name}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!entry && !isDoubles && (
            <div className="space-y-2">
              <Label htmlFor="participant">Participant</Label>
              <Select
                value={selectedParticipantId}
                onValueChange={setSelectedParticipantId}
                disabled={isLoading}
              >
                <SelectTrigger id="participant">
                  <SelectValue placeholder="Select a participant" />
                </SelectTrigger>
                <SelectContent>
                  {availableParticipants.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No available participants. All participants are already entered or you need to add participants first.
                    </div>
                  ) : (
                    availableParticipants.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        <div className="flex items-center gap-2">
                          {participant.display_name}
                          {participant.club && (
                            <span className="text-xs text-muted-foreground">
                              ({participant.club})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {multiDivisionWarning.length > 0 && (
                <div className="text-sm text-amber-600 dark:text-amber-500">
                  This participant is also in:{" "}
                  {multiDivisionWarning.map((div, i) => (
                    <Badge key={i} variant="outline" className="ml-1">
                      {div}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {!entry && isDoubles && (
            <>
              <div className="space-y-2">
                <Label htmlFor="player1">Player 1</Label>
                <Select
                  value={selectedParticipantId}
                  onValueChange={setSelectedParticipantId}
                  disabled={isLoading}
                >
                  <SelectTrigger id="player1">
                    <SelectValue placeholder="Select first player" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForPlayer1.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No available participants.
                      </div>
                    ) : (
                      availableForPlayer1.map((participant) => (
                        <SelectItem key={participant.id} value={participant.id}>
                          <div className="flex items-center gap-2">
                            {participant.display_name}
                            {participant.club && (
                              <span className="text-xs text-muted-foreground">
                                ({participant.club})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="player2">Player 2</Label>
                <Select
                  value={selectedParticipantId2}
                  onValueChange={setSelectedParticipantId2}
                  disabled={isLoading}
                >
                  <SelectTrigger id="player2">
                    <SelectValue placeholder="Select second player" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForPlayer2.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No available participants.
                      </div>
                    ) : (
                      availableForPlayer2.map((participant) => (
                        <SelectItem key={participant.id} value={participant.id}>
                          <div className="flex items-center gap-2">
                            {participant.display_name}
                            {participant.club && (
                              <span className="text-xs text-muted-foreground">
                                ({participant.club})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedParticipantId && selectedParticipantId2 && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  Team name:{" "}
                  <span className="font-medium">
                    {availableParticipants.find(p => p.id === selectedParticipantId)?.display_name}
                    {" / "}
                    {availableParticipants.find(p => p.id === selectedParticipantId2)?.display_name}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="seed">
              Seed (Optional)
            </Label>
            <Input
              id="seed"
              type="number"
              min={1}
              max={division.draw_size}
              placeholder="Leave empty for auto-seeding"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-sm text-muted-foreground">
              Seeding determines bracket position. Leave empty to auto-assign.
            </p>
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading
                ? entry
                  ? "Updating..."
                  : "Adding..."
                : entry
                  ? "Update Seed"
                  : isDoubles
                  ? "Add Team"
                  : "Add to Division"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
