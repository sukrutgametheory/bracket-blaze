"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { linkParticipantToPlayer } from "@/lib/actions/participants"
import { Participant } from "@/types/database"

interface BackfillModalProps {
  unlinkedParticipants: Participant[]
  tournamentId: string
}

export function BackfillModal({ unlinkedParticipants, tournamentId }: BackfillModalProps) {
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  if (unlinkedParticipants.length === 0) return null

  const handlePhoneChange = (participantId: string, value: string) => {
    setPhones((prev) => ({ ...prev, [participantId]: value }))
    // Clear error on change
    setErrors((prev) => {
      const next = { ...prev }
      delete next[participantId]
      return next
    })
  }

  const allPhonesFilled = unlinkedParticipants.every(
    (p) => phones[p.id] && phones[p.id].trim().length >= 7
  )

  const handleSaveAll = async () => {
    setIsSaving(true)
    setErrors({})

    const newErrors: Record<string, string> = {}
    let successCount = 0

    for (const participant of unlinkedParticipants) {
      const phone = phones[participant.id]?.trim()
      if (!phone || phone.length < 7) {
        newErrors[participant.id] = "Phone number is required"
        continue
      }

      const result = await linkParticipantToPlayer(
        participant.id,
        phone,
        participant.display_name,
        participant.email,
        participant.club
      )

      if (result.error) {
        newErrors[participant.id] = result.error
      } else {
        successCount++
      }
    }

    setErrors(newErrors)
    setIsSaving(false)

    if (Object.keys(newErrors).length === 0) {
      toast({
        title: "All players linked",
        description: `${successCount} participants linked to the global player registry.`,
      })
      router.refresh()
    } else {
      toast({
        title: "Some updates failed",
        description: `${successCount} succeeded, ${Object.keys(newErrors).length} failed. Fix errors and try again.`,
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={true}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            Phone numbers required — {unlinkedParticipants.length} player{unlinkedParticipants.length !== 1 ? "s" : ""} need updating
          </DialogTitle>
          <DialogDescription>
            All participants now require a phone number for the global player registry.
            Enter a phone number for each player below to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {unlinkedParticipants.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center gap-3 p-3 border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{participant.display_name}</p>
                  {participant.club && (
                    <Badge variant="outline" className="text-xs shrink-0">{participant.club}</Badge>
                  )}
                </div>
              </div>
              <div className="w-52 shrink-0">
                <Input
                  type="tel"
                  placeholder="e.g., 9876543210"
                  value={phones[participant.id] || ""}
                  onChange={(e) => handlePhoneChange(participant.id, e.target.value)}
                  disabled={isSaving}
                  className={errors[participant.id] ? "border-red-500" : ""}
                />
                {errors[participant.id] && (
                  <p className="text-xs text-red-500 mt-1">{errors[participant.id]}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <Button
            onClick={handleSaveAll}
            disabled={isSaving || !allPhonesFilled}
          >
            {isSaving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
