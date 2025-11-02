"use client"

import { useState } from "react"
import { Court } from "@/types/database"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CourtDialog } from "./court-dialog"
import { deleteCourt } from "@/lib/actions/courts"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface CourtListProps {
  courts: Court[]
  tournamentId: string
  userId: string
}

export function CourtList({ courts, tournamentId, userId }: CourtListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const handleAdd = () => {
    setSelectedCourt(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (court: Court) => {
    setSelectedCourt(court)
    setIsDialogOpen(true)
  }

  const handleDelete = async (courtId: string) => {
    if (!confirm("Are you sure you want to delete this court?")) {
      return
    }

    setIsDeleting(courtId)
    try {
      const result = await deleteCourt(courtId)

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
        description: "Court deleted successfully",
      })
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete court",
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
              <CardTitle>Courts</CardTitle>
              <CardDescription>
                Manage the courts available for this tournament
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>Add Court</Button>
          </div>
        </CardHeader>
        <CardContent>
          {courts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No courts have been added yet
              </p>
              <Button onClick={handleAdd}>Add Your First Court</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {courts.map((court) => (
                <div
                  key={court.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-semibold text-lg">{court.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(court.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={court.is_active ? "default" : "secondary"}>
                      {court.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(court)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(court.id)}
                      disabled={isDeleting === court.id}
                    >
                      {isDeleting === court.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CourtDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        court={selectedCourt}
        tournamentId={tournamentId}
      />
    </div>
  )
}
