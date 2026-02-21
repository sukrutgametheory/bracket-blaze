"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { divisionFormSchema, type DivisionFormData } from "@/lib/validations/tournament"
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

const playModeOptions = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
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
    resolver: zodResolver(divisionFormSchema),
    defaultValues: {
      sport: "badminton",
      name: "",
      play_mode: "singles",
      format: "swiss",
      draw_size: 16,
      rules_json: {},
      swiss_rounds: 5,
      swiss_qualifiers: 8,
    },
  })

  const selectedFormat = form.watch("format")
  const selectedPlayMode = form.watch("play_mode")
  const drawSize = form.watch("draw_size")

  // Update form when division changes
  useEffect(() => {
    if (division) {
      const rulesJson = (division.rules_json as Record<string, any>) || {}
      form.reset({
        sport: division.sport as "badminton" | "squash" | "pickleball" | "padel",
        name: division.name,
        play_mode: (division.play_mode || "singles") as "singles" | "doubles",
        format: division.format as "swiss" | "mexicano" | "groups_knockout",
        draw_size: division.draw_size,
        rules_json: rulesJson,
        // Extract format-specific fields from rules_json
        swiss_rounds: rulesJson.swiss_rounds,
        swiss_qualifiers: rulesJson.swiss_qualifiers,
        groups_count: rulesJson.groups_count,
        group_qualifiers_per_group: rulesJson.group_qualifiers_per_group,
        mexicano_rounds: rulesJson.mexicano_rounds,
        mexicano_qualifiers: rulesJson.mexicano_qualifiers,
      })
    } else {
      form.reset({
        sport: "badminton",
        name: "",
        play_mode: "singles",
        format: "swiss",
        draw_size: 16,
        rules_json: {},
        swiss_rounds: 5,
        swiss_qualifiers: 8,
      })
    }
  }, [division, form])

  async function onSubmit(values: DivisionFormData) {
    setIsLoading(true)

    try {
      // Build rules_json from format-specific fields
      const rules_json: Record<string, any> = {}

      if (values.format === "swiss") {
        rules_json.swiss_rounds = values.swiss_rounds
        rules_json.swiss_qualifiers = values.swiss_qualifiers
      } else if (values.format === "groups_knockout") {
        rules_json.groups_count = values.groups_count
        rules_json.group_qualifiers_per_group = values.group_qualifiers_per_group
      } else if (values.format === "mexicano") {
        rules_json.mexicano_rounds = values.mexicano_rounds
        rules_json.mexicano_qualifiers = values.mexicano_qualifiers
      }

      const payload = {
        sport: values.sport,
        name: values.name,
        play_mode: values.play_mode,
        format: values.format,
        draw_size: values.draw_size,
        rules_json,
      }

      const result = division
        ? await updateDivision(division.id, payload)
        : await createDivision(payload, tournamentId)

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-3 gap-4">
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
                name="play_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Play Mode</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {playModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Singles or doubles
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
                  <FormLabel>Draw Size (must be even)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={2}
                      max={512}
                      step={2}
                      disabled={isLoading}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum number of {selectedPlayMode === "doubles" ? "teams" : "participants"} (must be even, 2-512)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Swiss Format Fields */}
            {selectedFormat === "swiss" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="swiss_rounds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Swiss Rounds</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={3}
                            max={10}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Rounds before knockout (3-10)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="swiss_qualifiers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualifiers for Knockout</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={drawSize}
                            step={2}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Top N players advance (0 = Swiss only)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Groups + Knockout Format Fields */}
            {selectedFormat === "groups_knockout" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="groups_count"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Groups</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={2}
                            max={16}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Draw size must be divisible by this (2-16)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="group_qualifiers_per_group"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualifiers per Group</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={4}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Top N from each group advance (1-4)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Mexicano Format Fields */}
            {selectedFormat === "mexicano" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="mexicano_rounds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Rounds</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={3}
                            max={20}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Total rounds of play (3-20)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mexicano_qualifiers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualifiers for Playoff</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={drawSize}
                            step={2}
                            disabled={isLoading}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Top N for final playoff (0 = no playoff)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

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
