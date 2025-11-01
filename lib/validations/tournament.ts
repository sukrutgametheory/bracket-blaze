import { z } from "zod"

export const tournamentSchema = z.object({
  name: z.string().min(3, "Tournament name must be at least 3 characters").max(100),
  venue: z.string().min(3, "Venue must be at least 3 characters").max(200),
  timezone: z.string().default("UTC"),
  rest_window_minutes: z.number().int().min(0).max(120).default(15),
})

export const courtSchema = z.object({
  name: z.string().min(1, "Court name is required").max(20),
  is_active: z.boolean().default(true),
})

export const divisionSchema = z.object({
  sport: z.enum(["badminton", "squash", "pickleball", "padel"]),
  name: z.string().min(3, "Division name must be at least 3 characters").max(100),
  format: z.enum(["swiss", "mexicano", "groups_knockout"]),
  draw_size: z.number().int().min(2).max(512),
  rules_json: z.record(z.any()).optional().default({}),
})

export const participantSchema = z.object({
  display_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  club: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
})

export type TournamentFormData = z.infer<typeof tournamentSchema>
export type CourtFormData = z.infer<typeof courtSchema>
export type DivisionFormData = z.infer<typeof divisionSchema>
export type ParticipantFormData = z.infer<typeof participantSchema>
