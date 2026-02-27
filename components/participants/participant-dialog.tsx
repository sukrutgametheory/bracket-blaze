"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { participantSchema, type ParticipantFormData } from "@/lib/validations/tournament"
import { createParticipant, updateParticipant } from "@/lib/actions/participants"
import { findPlayerByPhone } from "@/lib/actions/players"
import { normalizePhone, isValidE164 } from "@/lib/utils/phone"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Participant } from "@/types/database"

interface ParticipantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  participant: Participant | null
  tournamentId: string
}

export function ParticipantDialog({
  open,
  onOpenChange,
  participant,
  tournamentId,
}: ParticipantDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [knownPlayer, setKnownPlayer] = useState(false)
  const [phoneLookedUp, setPhoneLookedUp] = useState(false)

  const isEditing = !!participant

  const form = useForm<ParticipantFormData>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      display_name: "",
      club: "",
      email: "",
      phone: "",
    },
  })

  // Update form when participant changes
  useEffect(() => {
    if (participant) {
      form.reset({
        display_name: participant.display_name,
        club: participant.club || "",
        email: participant.email || "",
        phone: participant.phone || "",
      })
      setPhoneLookedUp(true)
      setKnownPlayer(!!participant.player_id)
    } else {
      form.reset({
        display_name: "",
        club: "",
        email: "",
        phone: "",
      })
      setPhoneLookedUp(false)
      setKnownPlayer(false)
    }
  }, [participant, form])

  // Phone lookup on blur
  const handlePhoneLookup = useCallback(async () => {
    if (isEditing) return

    const rawPhone = form.getValues("phone")
    if (!rawPhone || rawPhone.length < 7) {
      setPhoneLookedUp(false)
      setKnownPlayer(false)
      return
    }

    // Try to normalize — if it fails, don't look up
    let normalized: string
    try {
      normalized = normalizePhone(rawPhone)
      if (!isValidE164(normalized)) return
    } catch {
      return
    }

    setIsLookingUp(true)
    try {
      const { data: player } = await findPlayerByPhone(rawPhone)
      if (player) {
        // Pre-fill from global registry
        form.setValue("display_name", player.display_name)
        if (player.club) form.setValue("club", player.club)
        if (player.email) form.setValue("email", player.email)
        setKnownPlayer(true)
      } else {
        setKnownPlayer(false)
      }
      setPhoneLookedUp(true)
    } catch {
      // Lookup failed — let user fill in manually
      setPhoneLookedUp(true)
      setKnownPlayer(false)
    } finally {
      setIsLookingUp(false)
    }
  }, [form, isEditing])

  async function onSubmit(values: ParticipantFormData) {
    setIsLoading(true)

    try {
      const result = isEditing
        ? await updateParticipant(participant.id, {
            display_name: values.display_name,
            club: values.club,
            email: values.email,
          })
        : await createParticipant(values, tournamentId)

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
        description: isEditing
          ? "Participant updated successfully"
          : "Participant created successfully",
      })

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
            {isEditing ? "Edit Participant" : "Add Participant"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the participant details below"
              : "Enter phone number to find or register a player"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Phone first — the primary identifier */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Phone Number</FormLabel>
                    {knownPlayer && (
                      <Badge variant="secondary" className="text-xs">Known player</Badge>
                    )}
                  </div>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="e.g., 9876543210 or +91 98765 43210"
                      disabled={isLoading || isEditing}
                      readOnly={isEditing}
                      {...field}
                      onBlur={(e) => {
                        field.onBlur()
                        handlePhoneLookup()
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEditing
                      ? "Phone cannot be changed after creation"
                      : isLookingUp
                        ? "Looking up player..."
                        : "Enter phone to check if player already exists"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show remaining fields after phone is entered (or always in edit mode) */}
            {(phoneLookedUp || isEditing) && (
              <>
                <FormField
                  control={form.control}
                  name="display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Player Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., John Smith"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Full name as it should appear on draws and scoreboards
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="club"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Club (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., City Badminton Club"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., player@example.com"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading || isLookingUp} className="flex-1">
                {isLoading
                  ? isEditing
                    ? "Updating..."
                    : "Creating..."
                  : isEditing
                    ? "Update Participant"
                    : "Add Participant"}
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
        </Form>
      </DialogContent>
    </Dialog>
  )
}
