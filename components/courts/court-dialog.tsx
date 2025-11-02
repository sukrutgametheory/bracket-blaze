"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { courtSchema, type CourtFormData } from "@/lib/validations/tournament"
import { createCourt, updateCourt } from "@/lib/actions/courts"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Court } from "@/types/database"

interface CourtDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  court: Court | null
  tournamentId: string
}

export function CourtDialog({
  open,
  onOpenChange,
  court,
  tournamentId,
}: CourtDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<CourtFormData>({
    resolver: zodResolver(courtSchema),
    defaultValues: {
      name: "",
      is_active: true,
    },
  })

  // Update form when court changes
  useEffect(() => {
    if (court) {
      form.reset({
        name: court.name,
        is_active: court.is_active,
      })
    } else {
      form.reset({
        name: "",
        is_active: true,
      })
    }
  }, [court, form])

  async function onSubmit(values: CourtFormData) {
    setIsLoading(true)

    try {
      const result = court
        ? await updateCourt(court.id, values)
        : await createCourt(values, tournamentId)

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
        description: court
          ? "Court updated successfully"
          : "Court created successfully",
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
          <DialogTitle>{court ? "Edit Court" : "Add Court"}</DialogTitle>
          <DialogDescription>
            {court
              ? "Update the court details below"
              : "Add a new court to your tournament"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Court Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., C1, Court A, Main Court"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A short identifier for this court (max 20 characters)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive courts will not be available for match assignments
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading
                  ? court
                    ? "Updating..."
                    : "Creating..."
                  : court
                    ? "Update Court"
                    : "Create Court"}
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
