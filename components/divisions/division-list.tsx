"use client"

import { useState } from "react"
import { Division } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DivisionDialog } from "./division-dialog"
import { deleteDivision } from "@/lib/actions/divisions"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface DivisionListProps {
  divisions: Division[]
  tournamentId: string
  userId: string
}

const sportLabels: Record<string, string> = {
  badminton: "Badminton",
  squash: "Squash",
  pickleball: "Pickleball",
  padel: "Padel",
}

const formatLabels: Record<string, string> = {
  swiss: "Swiss System",
  mexicano: "Mexicano",
  groups_knockout: "Groups → Knockout",
}

export function DivisionList({ divisions, tournamentId, userId }: DivisionListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const handleAdd = () => {
    setSelectedDivision(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (division: Division) => {
    setSelectedDivision(division)
    setIsDialogOpen(true)
  }

  const handleDelete = async (divisionId: string) => {
    if (!confirm("Are you sure you want to delete this division? This will also delete all associated entries and matches.")) {
      return
    }

    setIsDeleting(divisionId)
    try {
      const result = await deleteDivision(divisionId)

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
        description: "Division deleted successfully",
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete division",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Divisions</CardTitle>
              <CardDescription>
                Configure competition divisions for different sports and formats
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>Add Division</Button>
          </div>
        </CardHeader>
        <CardContent>
          {divisions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No divisions have been created yet
              </p>
              <Button onClick={handleAdd}>Add Your First Division</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {divisions.map((division) => {
                const rulesJson = (division.rules_json as Record<string, any>) || {}
                let formatDetails = ""

                if (division.format === "swiss") {
                  const rounds = rulesJson.swiss_rounds || "?"
                  const qualifiers = rulesJson.swiss_qualifiers || 0
                  formatDetails = `${rounds} rounds${qualifiers > 0 ? ` → Top ${qualifiers} to knockout` : ""}`
                } else if (division.format === "groups_knockout") {
                  const groups = rulesJson.groups_count || "?"
                  const qualifiers = rulesJson.group_qualifiers_per_group || "?"
                  formatDetails = `${groups} groups, Top ${qualifiers} advance`
                } else if (division.format === "mexicano") {
                  const rounds = rulesJson.mexicano_rounds || "?"
                  const qualifiers = rulesJson.mexicano_qualifiers || 0
                  formatDetails = `${rounds} rounds${qualifiers > 0 ? ` → Top ${qualifiers} to playoff` : ""}`
                }

                return (
                  <div
                    key={division.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-semibold text-lg">{division.name}</p>
                        <Badge variant="outline">{sportLabels[division.sport]}</Badge>
                        <Badge variant="secondary">{formatLabels[division.format]}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Draw Size: {division.draw_size}</span>
                        {formatDetails && <span>{formatDetails}</span>}
                        <span>Created {new Date(division.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="default" size="sm">
                        <Link href={`/tournaments/${tournamentId}/divisions/${division.id}/entries`}>
                          Manage Entries
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(division)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(division.id)}
                        disabled={isDeleting === division.id}
                      >
                        {isDeleting === division.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DivisionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        division={selectedDivision}
        tournamentId={tournamentId}
      />
    </div>
  )
}
