"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { divisionSchema, type DivisionFormData } from "@/lib/validations/tournament"
import { createDivision, updateDivision } from "@/lib/actions/divisions"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Division } from "@/types/database"

interface DivisionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  division: Division | null
  tournamentId: string
}

const sportOptions = [
  { value: "badminton", label: "Badminton" },
  { value: "squash", label: "Squash" },
  { value: "pickleball", label: "Pickleball" },
  { value: "padel", label: "Padel" },
]

const formatOptions = [
  { value: "swiss", label: "Swiss System" },
  { value: "mexicano", label: "Mexicano" },
  { value: "groups_knockout", label: "Groups → Knockout" },
]

export function DivisionDialog({
  open,
  onOpenChange,
  division,
  tournamentId,
}: DivisionDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<DivisionFormData>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      sport: "badminton",
      name: "",
      format: "swiss",
      draw_size: 16,
      rules_json: {},
    },
  })

  // Update form when division changes
  useEffect(() => {
    if (division) {
      form.reset({
        sport: division.sport as "badminton" | "squash" | "pickleball" | "padel",
        name: division.name,
        format: division.format as "swiss" | "mexicano" | "groups_knockout",
        draw_size: division.draw_size,
        rules_json: (division.rules_json as Record<string, any>) || {},
      })
    } else {
      form.reset({
        sport: "badminton",
        name: "",
        format: "swiss",
        draw_size: 16,
        rules_json: {},
      })
    }
  }, [division, form])

  async function onSubmit(values: DivisionFormData) {
    setIsLoading(true)

    try {
      const result = division
        ? await updateDivision(division.id, values)
        : await createDivision(values, tournamentId)

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
        description: division
          ? "Division updated successfully"
          : "Division created successfully",
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{division ? "Edit Division" : "Add Division"}</DialogTitle>
          <DialogDescription>
            {division
              ? "Update the division details below"
              : "Create a new division with sport-specific settings"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sport"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sport</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sport" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sportOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the sport for this division
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Format</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {formatOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Tournament format type
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Men's Singles, Women's Doubles, Mixed Open"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this division
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="draw_size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Draw Size</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={2}
                      max={512}
                      disabled={isLoading}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum number of participants (2-512)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading
                  ? division
                    ? "Updating..."
                    : "Creating..."
                  : division
                    ? "Update Division"
                    : "Create Division"}
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
