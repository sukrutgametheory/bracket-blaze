"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { participantSchema, type ParticipantFormData } from "@/lib/validations/tournament"
import { createParticipant, updateParticipant } from "@/lib/actions/participants"
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
    } else {
      form.reset({
        display_name: "",
        club: "",
        email: "",
        phone: "",
      })
    }
  }, [participant, form])

  async function onSubmit(values: ParticipantFormData) {
    setIsLoading(true)

    try {
      const result = participant
        ? await updateParticipant(participant.id, values)
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
        description: participant
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
            {participant ? "Edit Participant" : "Add Participant"}
          </DialogTitle>
          <DialogDescription>
            {participant
              ? "Update the participant details below"
              : "Add a new player to your tournament"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <FormDescription>
                    Club or team affiliation
                  </FormDescription>
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
                  <FormDescription>
                    For notifications and updates (future feature)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="e.g., +1 234 567 8900"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Contact number for tournament communications
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading
                  ? participant
                    ? "Updating..."
                    : "Creating..."
                  : participant
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
