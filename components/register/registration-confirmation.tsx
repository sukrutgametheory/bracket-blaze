"use client"

import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface RegisteredDivision {
  division_name: string
  play_mode: string
  partner_name?: string
}

interface RegistrationConfirmationProps {
  tournamentName: string
  tournamentVenue: string
  playerName: string
  registeredDivisions: RegisteredDivision[]
  existingDivisions?: RegisteredDivision[]
  onRegisterMore: () => void
}

export function RegistrationConfirmation({
  tournamentName,
  tournamentVenue,
  playerName,
  registeredDivisions,
  existingDivisions,
  onRegisterMore,
}: RegistrationConfirmationProps) {
  const allDivisions = [
    ...(existingDivisions || []),
    ...registeredDivisions,
  ]

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
        <div className="text-4xl mb-2">&#10003;</div>
        <CardTitle className="text-xl">You&apos;re all set!</CardTitle>
        <p className="text-sm text-muted-foreground">{tournamentName}</p>
        <p className="text-xs text-muted-foreground">{tournamentVenue}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm">
          <span className="font-medium">{playerName}</span>, you are registered
          for the following divisions:
        </p>

        <div className="space-y-2">
          {allDivisions.map((div, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
            >
              <div>
                <p className="font-medium text-sm">{div.division_name}</p>
                {div.partner_name && (
                  <p className="text-xs text-muted-foreground">
                    Partner: {div.partner_name}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                {div.play_mode}
              </Badge>
            </div>
          ))}
        </div>

        <div className="pt-4 text-center">
          <Button variant="outline" size="sm" onClick={onRegisterMore}>
            Register for more divisions
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
