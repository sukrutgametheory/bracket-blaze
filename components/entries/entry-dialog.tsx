"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Division, Participant } from "@/types/database"
import { createEntry, updateEntry } from "@/lib/actions/entries"
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
  participant_id: string
  seed: number | null
  status: string
  created_at: string
  participant: Participant
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
  const [seed, setSeed] = useState<string>("")
  const [multiDivisionWarning, setMultiDivisionWarning] = useState<string[]>([])

  // Update form when entry changes
  useEffect(() => {
    if (entry) {
      setSelectedParticipantId(entry.participant_id)
      setSeed(entry.seed?.toString() || "")
    } else {
      setSelectedParticipantId("")
      setSeed("")
    }
    setMultiDivisionWarning([])
  }, [entry, open])

  // Check for multi-division participation when participant selected
  useEffect(() => {
    if (selectedParticipantId && !entry) {
      // TODO: In a future enhancement, fetch other divisions this participant is in
      // For now, we'll skip this check
      setMultiDivisionWarning([])
    }
  }, [selectedParticipantId, entry])

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
      } else {
        // Create new entry
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
            {entry ? "Edit Entry Seed" : "Add Entry to Division"}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `Update seeding for ${entry.participant.display_name}`
              : `Add a participant to ${division.name}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!entry && (
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
                  ⚠️ This participant is also in:{" "}
                  {multiDivisionWarning.map((div, i) => (
                    <Badge key={i} variant="outline" className="ml-1">
                      {div}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
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
