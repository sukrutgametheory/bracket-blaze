"use client"

import { useState, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone, isValidE164 } from "@/lib/utils/phone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import Image from "next/image"
import { RegistrationConfirmation } from "./registration-confirmation"

interface DivisionInfo {
  id: string
  name: string
  sport: string
  play_mode: string
  format: string
  draw_size: number
  entry_count: number
  spots_remaining: number
}

interface ExistingEntry {
  division_id: string
  division_name: string
  play_mode: string
  team_name: string | null
}

interface PartnerFields {
  name: string
  phone: string
  duprId: string
}

interface RegistrationFormProps {
  tournamentId: string
  tournamentName: string
  tournamentVenue: string
  divisions: DivisionInfo[]
  supabaseUrl: string
  supabaseAnonKey: string
}

export function RegistrationForm({
  tournamentId,
  tournamentName,
  tournamentVenue,
  divisions: initialDivisions,
  supabaseUrl,
  supabaseAnonKey,
}: RegistrationFormProps) {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))

  // Phone-first flow state
  const [phone, setPhone] = useState("")
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [phoneLookedUp, setPhoneLookedUp] = useState(false)
  const [knownPlayer, setKnownPlayer] = useState(false)

  // Player info
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [duprId, setDuprId] = useState("")

  // Division selection
  const [divisions, setDivisions] = useState<DivisionInfo[]>(initialDivisions)
  const [selectedDivisions, setSelectedDivisions] = useState<Set<string>>(
    new Set()
  )
  const [existingEntries, setExistingEntries] = useState<ExistingEntry[]>([])

  // Partner fields for doubles divisions
  const [partnerFields, setPartnerFields] = useState<
    Record<string, PartnerFields>
  >({})

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Confirmation state
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmedDivisions, setConfirmedDivisions] = useState<
    { division_name: string; play_mode: string; partner_name?: string }[]
  >([])

  // Phone lookup on blur
  const handlePhoneLookup = useCallback(async () => {
    if (!phone || phone.length < 7) {
      setPhoneLookedUp(false)
      setKnownPlayer(false)
      return
    }

    let normalized: string
    try {
      normalized = normalizePhone(phone)
      if (!isValidE164(normalized)) return
    } catch {
      return
    }

    setIsLookingUp(true)
    try {
      const { data, error } = await supabase.rpc(
        "bracket_blaze_registration_lookup",
        {
          p_tournament_id: tournamentId,
          p_phone: normalized,
        }
      )

      if (error) {
        setPhoneLookedUp(true)
        setKnownPlayer(false)
        return
      }

      // Update divisions with fresh spot counts
      if (data?.divisions) {
        setDivisions(data.divisions)
      }

      if (data?.player) {
        setDisplayName(data.player.display_name || "")
        setEmail(data.player.email || "")
        setDuprId(data.player.dupr_id || "")
        setKnownPlayer(true)
      } else {
        setKnownPlayer(false)
      }

      if (data?.existing_entries) {
        setExistingEntries(data.existing_entries)
      }

      setPhoneLookedUp(true)
    } catch {
      setPhoneLookedUp(true)
      setKnownPlayer(false)
    } finally {
      setIsLookingUp(false)
    }
  }, [phone, supabase, tournamentId])

  // Toggle division selection
  const handleDivisionToggle = (divisionId: string, checked: boolean) => {
    const next = new Set(selectedDivisions)
    if (checked) {
      next.add(divisionId)
      // Initialize partner fields for doubles
      const div = divisions.find((d) => d.id === divisionId)
      if (div?.play_mode === "doubles") {
        setPartnerFields((prev) => ({
          ...prev,
          [divisionId]: { name: "", phone: "", duprId: "" },
        }))
      }
    } else {
      next.delete(divisionId)
      setPartnerFields((prev) => {
        const copy = { ...prev }
        delete copy[divisionId]
        return copy
      })
    }
    setSelectedDivisions(next)
    setSubmitError(null)
  }

  // Update partner fields
  const handlePartnerChange = (
    divisionId: string,
    field: "name" | "phone" | "duprId",
    value: string
  ) => {
    setPartnerFields((prev) => ({
      ...prev,
      [divisionId]: { ...prev[divisionId], [field]: value },
    }))
  }

  // Check if any selected division is pickleball
  const showDuprField = Array.from(selectedDivisions).some((id) => {
    const div = divisions.find((d) => d.id === id)
    return div?.sport === "pickleball"
  })

  // Existing entry division IDs (disabled in checkboxes)
  const existingDivisionIds = new Set(
    existingEntries.map((e) => e.division_id)
  )

  // Validate form
  const validateForm = (): string | null => {
    if (!phone || phone.length < 7) return "Phone number is required"
    try {
      const norm = normalizePhone(phone)
      if (!isValidE164(norm)) return "Please enter a valid phone number"
    } catch {
      return "Please enter a valid phone number"
    }
    if (!displayName.trim()) return "Name is required"
    if (!email.trim()) return "Email is required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address"
    if (selectedDivisions.size === 0) return "Select at least one division"

    // Check partner fields for doubles
    for (const divId of selectedDivisions) {
      const div = divisions.find((d) => d.id === divId)
      if (div?.play_mode === "doubles") {
        const partner = partnerFields[divId]
        if (!partner?.name.trim()) {
          return `Partner name is required for ${div.name}`
        }
        if (!partner?.phone || partner.phone.length < 7) {
          return `Partner phone is required for ${div.name}`
        }
        try {
          const partnerNorm = normalizePhone(partner.phone)
          if (!isValidE164(partnerNorm)) return `Invalid partner phone for ${div.name}`
        } catch {
          return `Invalid partner phone for ${div.name}`
        }
      }
    }

    return null
  }

  // Submit registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const validationError = validateForm()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    const normalized = normalizePhone(phone)

    // Build registrations array
    const registrations = Array.from(selectedDivisions).map((divId) => {
      const div = divisions.find((d) => d.id === divId)
      if (div?.play_mode === "doubles") {
        const partner = partnerFields[divId]
        return {
          division_id: divId,
          type: "doubles",
          partner_name: partner.name.trim(),
          partner_phone: normalizePhone(partner.phone),
          partner_dupr_id: partner.duprId?.trim() || null,
        }
      }
      return { division_id: divId, type: "singles" }
    })

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.rpc(
        "bracket_blaze_register_for_tournament",
        {
          p_tournament_id: tournamentId,
          p_phone: normalized,
          p_display_name: displayName.trim(),
          p_email: email.trim(),
          p_dupr_id: duprId.trim() || null,
          p_registrations: registrations,
        }
      )

      if (error) {
        setSubmitError(error.message)
        return
      }

      // Build confirmation data
      const newlyRegistered = Array.from(selectedDivisions).map((divId) => {
        const div = divisions.find((d) => d.id === divId)!
        const partner = partnerFields[divId]
        return {
          division_name: div.name,
          play_mode: div.play_mode,
          partner_name: partner?.name?.trim() || undefined,
        }
      })

      setConfirmedDivisions(newlyRegistered)
      setShowConfirmation(true)
    } catch {
      setSubmitError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset to allow more registrations
  const handleRegisterMore = () => {
    setShowConfirmation(false)
    setSelectedDivisions(new Set())
    setPartnerFields({})
    setSubmitError(null)
    // Re-run phone lookup to refresh divisions + existing entries
    handlePhoneLookup()
  }

  // Confirmation screen
  if (showConfirmation) {
    return (
      <RegistrationConfirmation
        tournamentName={tournamentName}
        tournamentVenue={tournamentVenue}
        playerName={displayName}
        registeredDivisions={confirmedDivisions}
        existingDivisions={existingEntries.map((e) => ({
          division_name: e.division_name,
          play_mode: e.play_mode,
          partner_name: e.team_name || undefined,
        }))}
        onRegisterMore={handleRegisterMore}
      />
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Image
          src="/game-theory-logo.png"
          alt="Game Theory"
          width={80}
          height={80}
          className="mx-auto mb-2"
        />
        <CardTitle className="text-xl">{tournamentName}</CardTitle>
        <p className="text-sm text-muted-foreground">{tournamentVenue}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Phone first */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              {knownPlayer && (
                <Badge variant="secondary" className="text-xs">
                  Welcome back
                </Badge>
              )}
            </div>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g., 9876543210 or +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneLookup}
              disabled={isSubmitting}
            />
            {!phoneLookedUp && (
              <Button
                type="button"
                className="w-full"
                onClick={handlePhoneLookup}
                disabled={isLookingUp || !phone || phone.length < 7}
              >
                {isLookingUp ? "Looking up..." : "Continue"}
              </Button>
            )}
          </div>

          {/* Show rest of form after phone lookup */}
          {phoneLookedUp && (
            <>
              {/* Existing registrations */}
              {existingEntries.length > 0 && (
                <div className="space-y-2">
                  <Label>Your existing registrations</Label>
                  <div className="space-y-1">
                    {existingEntries.map((entry) => (
                      <div
                        key={entry.division_id}
                        className="flex items-center justify-between p-2 bg-green-50 rounded text-sm"
                      >
                        <span>{entry.division_name}</span>
                        <Badge variant="outline" className="text-xs">
                          Registered
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Player info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Name *</Label>
                  <Input
                    id="displayName"
                    placeholder="Your full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="player@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Division selection */}
              <div className="space-y-3">
                <Label>Select Divisions</Label>
                <div className="space-y-2">
                  {divisions.map((div) => {
                    const isExisting = existingDivisionIds.has(div.id)
                    const isFull = div.spots_remaining <= 0
                    const isDisabled = isExisting || isFull || isSubmitting

                    return (
                      <div key={div.id} className="space-y-2">
                        <div
                          className={`flex items-center space-x-3 p-3 rounded-md border ${
                            isDisabled
                              ? "bg-gray-50 opacity-60"
                              : selectedDivisions.has(div.id)
                                ? "bg-blue-50 border-blue-200"
                                : "hover:bg-gray-50"
                          }`}
                        >
                          <Checkbox
                            id={`div-${div.id}`}
                            checked={
                              isExisting || selectedDivisions.has(div.id)
                            }
                            onCheckedChange={(checked) =>
                              handleDivisionToggle(div.id, !!checked)
                            }
                            disabled={isDisabled}
                          />
                          <label
                            htmlFor={`div-${div.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {div.name}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {div.sport}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {div.play_mode}
                                </Badge>
                              </div>
                              <span
                                className={`text-xs ${
                                  isFull
                                    ? "text-red-600 font-medium"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isExisting
                                  ? "Registered"
                                  : isFull
                                    ? "Full"
                                    : `${div.entry_count}/${div.draw_size}`}
                              </span>
                            </div>
                          </label>
                        </div>

                        {/* Partner fields for doubles */}
                        {selectedDivisions.has(div.id) &&
                          div.play_mode === "doubles" && (
                            <div className="ml-8 p-3 bg-gray-50 rounded-md space-y-3 border-l-2 border-blue-200">
                              <p className="text-xs font-medium text-muted-foreground">
                                Partner details for {div.name}
                              </p>
                              <div className="space-y-2">
                                <Label htmlFor={`partner-name-${div.id}`}>
                                  Partner Name *
                                </Label>
                                <Input
                                  id={`partner-name-${div.id}`}
                                  placeholder="Partner's full name"
                                  value={partnerFields[div.id]?.name || ""}
                                  onChange={(e) =>
                                    handlePartnerChange(
                                      div.id,
                                      "name",
                                      e.target.value
                                    )
                                  }
                                  disabled={isSubmitting}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`partner-phone-${div.id}`}>
                                  Partner Phone *
                                </Label>
                                <Input
                                  id={`partner-phone-${div.id}`}
                                  type="tel"
                                  placeholder="Partner's phone number"
                                  value={partnerFields[div.id]?.phone || ""}
                                  onChange={(e) =>
                                    handlePartnerChange(
                                      div.id,
                                      "phone",
                                      e.target.value
                                    )
                                  }
                                  disabled={isSubmitting}
                                />
                              </div>
                              {div.sport === "pickleball" && (
                                <div className="space-y-2">
                                  <Label htmlFor={`partner-dupr-${div.id}`}>
                                    Partner DUPR ID (Optional)
                                  </Label>
                                  <Input
                                    id={`partner-dupr-${div.id}`}
                                    placeholder="e.g., 12345678"
                                    value={partnerFields[div.id]?.duprId || ""}
                                    onChange={(e) =>
                                      handlePartnerChange(
                                        div.id,
                                        "duprId",
                                        e.target.value
                                      )
                                    }
                                    disabled={isSubmitting}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DUPR ID (only when pickleball selected) */}
              {showDuprField && (
                <div className="space-y-2">
                  <Label htmlFor="duprId">DUPR ID (Optional)</Label>
                  <Input
                    id="duprId"
                    placeholder="e.g., 12345678"
                    value={duprId}
                    onChange={(e) => setDuprId(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your DUPR rating ID for pickleball divisions
                  </p>
                </div>
              )}

              {/* Error */}
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || selectedDivisions.size === 0}
              >
                {isSubmitting
                  ? "Registering..."
                  : selectedDivisions.size === 0
                    ? "Select a division to register"
                    : `Register for ${selectedDivisions.size} division${selectedDivisions.size > 1 ? "s" : ""}`}
              </Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
