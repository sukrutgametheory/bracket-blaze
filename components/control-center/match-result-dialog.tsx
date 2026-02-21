"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { GameScore, WinnerSide } from "@/types/database"
import { Plus, Trash2 } from "lucide-react"

interface MatchResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matchId: string
  sideAName: string
  sideBName: string
  onSubmitResult: (matchId: string, winnerSide: WinnerSide, games: GameScore[]) => void
  onSubmitWalkover: (matchId: string, winnerSide: WinnerSide) => void
  mode?: 'record' | 'edit'
  initialGames?: GameScore[]
  initialWalkover?: boolean
}

export function MatchResultDialog({
  open,
  onOpenChange,
  matchId,
  sideAName,
  sideBName,
  onSubmitResult,
  onSubmitWalkover,
  mode = 'record',
  initialGames,
  initialWalkover,
}: MatchResultDialogProps) {
  const defaultGames = initialGames && initialGames.length > 0 ? initialGames : [{ score_a: 0, score_b: 0 }]
  const [games, setGames] = useState<GameScore[]>(defaultGames)
  const [isWalkover, setIsWalkover] = useState(initialWalkover ?? false)
  const [walkoverWinner, setWalkoverWinner] = useState<WinnerSide | null>(null)

  const addGame = () => {
    setGames([...games, { score_a: 0, score_b: 0 }])
  }

  const removeGame = (index: number) => {
    if (games.length > 1) {
      setGames(games.filter((_, i) => i !== index))
    }
  }

  const updateGame = (index: number, field: 'score_a' | 'score_b', value: number) => {
    const updated = [...games]
    updated[index] = { ...updated[index], [field]: Math.max(0, value) }
    setGames(updated)
  }

  const determineWinner = (): WinnerSide | null => {
    let aWins = 0
    let bWins = 0
    for (const game of games) {
      if (game.score_a > game.score_b) aWins++
      else if (game.score_b > game.score_a) bWins++
    }
    if (aWins > bWins) return 'A'
    if (bWins > aWins) return 'B'
    return null
  }

  const handleSubmit = () => {
    if (isWalkover && walkoverWinner) {
      onSubmitWalkover(matchId, walkoverWinner)
      resetAndClose()
      return
    }

    const winner = determineWinner()
    if (!winner) return

    onSubmitResult(matchId, winner, games)
    resetAndClose()
  }

  const resetAndClose = () => {
    const resetGames = initialGames && initialGames.length > 0 ? initialGames : [{ score_a: 0, score_b: 0 }]
    setGames(resetGames)
    setIsWalkover(initialWalkover ?? false)
    setWalkoverWinner(null)
    onOpenChange(false)
  }

  const winner = isWalkover ? walkoverWinner : determineWinner()
  const canSubmit = isWalkover ? !!walkoverWinner : !!winner

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Match Score' : 'Record Result'}</DialogTitle>
          <DialogDescription>
            {sideAName} vs {sideBName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Toggle between score entry and walkover */}
          <div className="flex gap-2">
            <Button
              variant={!isWalkover ? "default" : "outline"}
              size="sm"
              onClick={() => setIsWalkover(false)}
            >
              Game Scores
            </Button>
            <Button
              variant={isWalkover ? "default" : "outline"}
              size="sm"
              onClick={() => setIsWalkover(true)}
            >
              Walkover
            </Button>
          </div>

          {isWalkover ? (
            <div className="space-y-3">
              <Label>Winner</Label>
              <div className="flex gap-2">
                <Button
                  variant={walkoverWinner === 'A' ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setWalkoverWinner('A')}
                >
                  {sideAName}
                </Button>
                <Button
                  variant={walkoverWinner === 'B' ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setWalkoverWinner('B')}
                >
                  {sideBName}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center">
                <Label className="text-center text-xs truncate">{sideAName}</Label>
                <div />
                <Label className="text-center text-xs truncate">{sideBName}</Label>
                <div className="w-8" />
              </div>

              {/* Game score rows */}
              {games.map((game, i) => (
                <div key={i} className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center">
                  <Input
                    type="number"
                    min={0}
                    value={game.score_a}
                    onChange={(e) => updateGame(i, 'score_a', parseInt(e.target.value) || 0)}
                    className="text-center"
                  />
                  <span className="text-xs text-muted-foreground px-1">-</span>
                  <Input
                    type="number"
                    min={0}
                    value={game.score_b}
                    onChange={(e) => updateGame(i, 'score_b', parseInt(e.target.value) || 0)}
                    className="text-center"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeGame(i)}
                    disabled={games.length <= 1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addGame} className="w-full">
                <Plus className="h-3 w-3 mr-1" /> Add Game
              </Button>
            </div>
          )}

          {/* Winner indicator */}
          {winner && (
            <div className="text-sm font-medium text-center p-2 bg-primary/10 rounded">
              Winner: {winner === 'A' ? sideAName : sideBName}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mode === 'edit' ? 'Save Changes' : 'Submit Result'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
