import { z } from "zod"
import { normalizePhone, isValidE164 } from "@/lib/utils/phone"

export const tournamentSchema = z.object({
  name: z.string().min(3, "Tournament name must be at least 3 characters").max(100),
  venue: z.string().min(3, "Venue must be at least 3 characters").max(200),
  timezone: z.string().min(1),
  rest_window_minutes: z.number().int().min(0).max(120),
})

export const courtSchema = z.object({
  name: z.string().min(1, "Court name is required").max(20),
  is_active: z.boolean(),
})

export const divisionSchema = z.object({
  sport: z.enum(["badminton", "squash", "pickleball", "padel"]),
  name: z.string().min(3, "Division name must be at least 3 characters").max(100),
  play_mode: z.enum(["singles", "doubles"]),
  format: z.enum(["swiss", "mexicano", "groups_knockout"]),
  draw_size: z.number().int().min(2).max(512).refine((val) => val % 2 === 0, {
    message: "Draw size must be an even number",
  }),
  rules_json: z.record(z.string(), z.any()),
})

// Extended schema with format-specific fields
export const divisionFormSchema = divisionSchema.extend({
  // For Swiss format
  swiss_rounds: z.number().int().min(1).max(10).optional(),
  swiss_qualifiers: z.number().int().min(0).optional(),

  // For Groups + Knockout format
  groups_count: z.number().int().min(2).max(16).optional(),
  group_qualifiers_per_group: z.number().int().min(1).max(4).optional(),

  // For Mexicano format
  mexicano_rounds: z.number().int().min(3).max(20).optional(),
  mexicano_qualifiers: z.number().int().min(0).optional(),
}).refine((data) => {
  // Swiss format validations
  if (data.format === "swiss") {
    if (!data.swiss_rounds || data.swiss_rounds < 3) return false
    if (data.swiss_qualifiers !== undefined && data.swiss_qualifiers > data.draw_size) return false
    // Qualifiers must be a power of 2 (for clean knockout brackets)
    if (data.swiss_qualifiers !== undefined && data.swiss_qualifiers > 0) {
      const isPowerOf2 = (n: number) => n > 0 && (n & (n - 1)) === 0
      if (!isPowerOf2(data.swiss_qualifiers)) return false
    }
  }

  // Groups + Knockout validations
  if (data.format === "groups_knockout") {
    if (!data.groups_count || data.groups_count < 2) return false
    if (!data.group_qualifiers_per_group || data.group_qualifiers_per_group < 1) return false
    // Ensure draw_size is divisible by groups_count
    if (data.draw_size % data.groups_count !== 0) return false
  }

  // Mexicano format validations
  if (data.format === "mexicano") {
    if (!data.mexicano_rounds || data.mexicano_rounds < 3) return false
    if (data.mexicano_qualifiers !== undefined && data.mexicano_qualifiers > data.draw_size) return false
  }

  return true
}, {
  message: "Invalid configuration for selected format",
})

export const participantSchema = z.object({
  display_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  club: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string()
    .min(1, "Phone number is required")
    .max(20)
    .transform(normalizePhone)
    .refine(isValidE164, "Invalid phone number format"),
})

export type TournamentFormData = z.infer<typeof tournamentSchema>
export type CourtFormData = z.infer<typeof courtSchema>
export type DivisionFormData = z.infer<typeof divisionFormSchema>
export type ParticipantFormData = z.infer<typeof participantSchema>
