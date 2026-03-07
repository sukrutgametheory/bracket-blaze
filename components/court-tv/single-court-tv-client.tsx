"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Oswald } from "next/font/google"
import { getEntryDisplayName } from "@/lib/utils/display-name"
import { TABLE_NAMES, type Court, type GameScore, type LiveScore } from "@/types/database"

interface CourtTvMatch {
  id: string
  division_id: string
  status: string
  court_id: string
  meta_json: any
  round: number
  sequence: number
  phase: string
  division: { id: string; name: string } | null
  side_a: { participant: { display_name: string } | null; team: { name: string } | null } | null
  side_b: { participant: { display_name: string } | null; team: { name: string } | null } | null
}

interface RealtimeMatchRow {
  id: string
  division_id: string | null
  court_id: string | null
}

interface SingleCourtTvClientProps {
  tournamentId: string
  tournamentName: string
  courts: Court[]
  divisionIds: string[]
  initialMatches: any[]
  supabaseUrl: string
  supabaseAnonKey: string
}

const MATCH_STATUSES = ["ready", "on_court", "pending_signoff", "completed"] as const
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"] })

const statusPriority: Record<string, number> = {
  completed: 0,
  ready: 1,
  pending_signoff: 2,
  on_court: 3,
}

function buildCourtMatchMap(matches: CourtTvMatch[]) {
  const sortedMatches = [...matches].sort(
    (a, b) => (statusPriority[a.status] || 0) - (statusPriority[b.status] || 0)
  )
  return new Map(sortedMatches.map(match => [match.court_id, match]))
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function normalizeMatches(input: any[]): CourtTvMatch[] {
  return input.map(match => ({
    ...match,
    division: pickFirst(match.division),
    side_a: pickFirst(match.side_a),
    side_b: pickFirst(match.side_b),
  }))
}

export function SingleCourtTvClient({
  tournamentId,
  tournamentName,
  courts,
  divisionIds,
  initialMatches,
  supabaseUrl,
  supabaseAnonKey,
}: SingleCourtTvClientProps) {
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))
  const [availableCourts, setAvailableCourts] = useState<Court[]>(courts)
  const [matches, setMatches] = useState<CourtTvMatch[]>(normalizeMatches(initialMatches))
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null)
  const [showCourtPicker, setShowCourtPicker] = useState(false)
  const [focusedCourtIndex, setFocusedCourtIndex] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSelectionInitialized, setIsSelectionInitialized] = useState(false)

  const courtButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const storageKey = `tv:selected-court:${tournamentId}`

  const divisionIdSet = useMemo(() => new Set(divisionIds), [divisionIds])
  const courtMatchMap = useMemo(() => buildCourtMatchMap(matches), [matches])

  const selectedCourt = selectedCourtId
    ? availableCourts.find(court => court.id === selectedCourtId) || null
    : null

  const selectedMatch = selectedCourtId
    ? courtMatchMap.get(selectedCourtId) || null
    : null

  const syncCourtState = useCallback(
    async (targetCourtId?: string | null) => {
      const nextCourtId = targetCourtId ?? selectedCourtId
      setIsSyncing(true)

      try {
        if (!nextCourtId) return

        const { data: selectedCourtMatches } = await supabase
          .from(TABLE_NAMES.MATCHES)
          .select(`
            id, division_id, status, court_id, meta_json, round, sequence, phase,
            division:bracket_blaze_divisions!inner(id, name),
            side_a:bracket_blaze_entries!side_a_entry_id(
              participant:bracket_blaze_participants(display_name),
              team:bracket_blaze_teams(name)
            ),
            side_b:bracket_blaze_entries!side_b_entry_id(
              participant:bracket_blaze_participants(display_name),
              team:bracket_blaze_teams(name)
            )
          `)
          .eq("court_id", nextCourtId)
          .in("status", [...MATCH_STATUSES])

        if (!selectedCourtMatches) return

        const normalizedMatches = normalizeMatches(selectedCourtMatches)

        setMatches(prev => {
          const withoutSelectedCourt = prev.filter(match => match.court_id !== nextCourtId)
          return [...withoutSelectedCourt, ...normalizedMatches]
        })
      } finally {
        setIsSyncing(false)
      }
    },
    [selectedCourtId, supabase]
  )

  useEffect(() => {
    if (availableCourts.length === 0) {
      setSelectedCourtId(null)
      setShowCourtPicker(false)
      return
    }

    if (typeof window === "undefined") return

    if (isSelectionInitialized) {
      if (selectedCourtId && !availableCourts.some(court => court.id === selectedCourtId)) {
        window.localStorage.removeItem(storageKey)
        setSelectedCourtId(availableCourts[0].id)
        setShowCourtPicker(true)
      }
      return
    }

    const storedCourtId = window.localStorage.getItem(storageKey)
    const hasStoredCourt = storedCourtId && availableCourts.some(court => court.id === storedCourtId)

    if (hasStoredCourt) {
      setSelectedCourtId(storedCourtId)
      setShowCourtPicker(false)
      setIsSelectionInitialized(true)
      return
    }

    if (storedCourtId) {
      window.localStorage.removeItem(storageKey)
    }

    setSelectedCourtId(availableCourts[0].id)
    setShowCourtPicker(true)
    setIsSelectionInitialized(true)
  }, [availableCourts, isSelectionInitialized, selectedCourtId, storageKey])

  useEffect(() => {
    if (!selectedCourtId) return
    void syncCourtState(selectedCourtId)
  }, [selectedCourtId, syncCourtState])

  useEffect(() => {
    if (!selectedCourtId) return

    const channel = supabase
      .channel(`single-court-tv-status:${tournamentId}:${selectedCourtId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLE_NAMES.MATCHES,
        },
        payload => {
          const nextRow = payload.new as Partial<RealtimeMatchRow>
          const previousRow = payload.old as Partial<RealtimeMatchRow>
          const divisionId = nextRow.division_id || previousRow.division_id || null

          if (divisionId && divisionIdSet.size > 0 && !divisionIdSet.has(divisionId)) {
            return
          }

          const touchesSelectedCourt =
            nextRow.court_id === selectedCourtId || previousRow.court_id === selectedCourtId

          if (touchesSelectedCourt) {
            void syncCourtState(selectedCourtId)
          }
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          void syncCourtState(selectedCourtId)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [divisionIdSet, selectedCourtId, supabase, syncCourtState, tournamentId])

  useEffect(() => {
    if (!selectedMatch?.id) return

    const channel = supabase
      .channel(`match:${selectedMatch.id}`)
      .on("broadcast", { event: "score_update" }, payload => {
        const data = payload.payload as {
          live_score?: LiveScore
          games?: GameScore[]
        }

        setMatches(prev =>
          prev.map(match => {
            if (match.id !== selectedMatch.id) return match

            return {
              ...match,
              meta_json: {
                ...match.meta_json,
                live_score: data.live_score ?? match.meta_json?.live_score,
                games: data.games ?? match.meta_json?.games,
              },
            }
          })
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedMatch?.id, supabase])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncCourtState(selectedCourtId)
      }
    }

    const handleOnline = () => {
      void syncCourtState(selectedCourtId)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [selectedCourtId, syncCourtState])

  useEffect(() => {
    if (!showCourtPicker) return

    const button = courtButtonRefs.current[focusedCourtIndex]
    button?.focus()
  }, [focusedCourtIndex, showCourtPicker])

  const openCourtPicker = () => {
    const selectedIndex = availableCourts.findIndex(court => court.id === selectedCourtId)
    setFocusedCourtIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setShowCourtPicker(true)
  }

  const handleSelectCourt = (courtId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, courtId)
    }

    setSelectedCourtId(courtId)
    setShowCourtPicker(false)
  }

  const handleCourtPickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (availableCourts.length === 0) return

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      setFocusedCourtIndex(index => (index + 1) % availableCourts.length)
      return
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      setFocusedCourtIndex(index => (index - 1 + availableCourts.length) % availableCourts.length)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const court = availableCourts[focusedCourtIndex]
      if (court) {
        handleSelectCourt(court.id)
      }
    }
  }

  const metaJson = selectedMatch?.meta_json || {}
  const liveScore: LiveScore | null = metaJson.live_score || null
  const games: GameScore[] = metaJson.games || []
  const latestGame = games.length > 0 ? games[games.length - 1] : null

  const isReady = selectedMatch?.status === "ready"
  const isLive = selectedMatch?.status === "on_court"
  const isPending = selectedMatch?.status === "pending_signoff"
  const isCompleted = selectedMatch?.status === "completed"

  const sideAName = getEntryDisplayName(selectedMatch?.side_a ?? null)
  const sideBName = getEntryDisplayName(selectedMatch?.side_b ?? null)

  const scoreA = liveScore?.score_a ?? latestGame?.score_a ?? null
  const scoreB = liveScore?.score_b ?? latestGame?.score_b ?? null
  const showScores = !isReady && scoreA !== null && scoreB !== null

  const statusLabel = isLive
    ? "Live"
    : isPending
    ? "Pending Sign-Off"
    : isReady
    ? "Starting Soon"
    : isCompleted
    ? "Final"
    : "Awaiting Assignment"

  const statusColor = isLive
    ? "text-emerald-300"
    : isPending
    ? "text-amber-300"
    : isReady
    ? "text-sky-300"
    : isCompleted
    ? "text-slate-300"
    : "text-slate-400"

  const pickerGridClassName =
    availableCourts.length >= 13
      ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
      : availableCourts.length >= 9
      ? "grid-cols-2 md:grid-cols-3"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

  return (
    <div className="h-dvh overflow-hidden bg-[#030712] text-white">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col px-4 py-4 md:px-8 md:py-6">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 pb-4">
          <div className="min-w-0 pr-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Court TV</p>
            <h1 className="mt-1 line-clamp-2 text-xl font-bold text-slate-100 md:text-3xl">{tournamentName}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isSyncing && (
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Syncing</span>
            )}
            <button
              type="button"
              onClick={openCourtPicker}
              className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Change Court
            </button>
          </div>
        </header>

        <main className="mt-4 flex min-h-0 flex-1">
          {!selectedCourt ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-950">
              <p className="text-2xl font-semibold text-slate-300 md:text-3xl">No Active Courts</p>
            </div>
          ) : (
            <section className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950 to-slate-900 p-5 md:p-8">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected Court</p>
                  <h2 className="mt-1 break-words text-2xl font-bold text-slate-100 md:text-4xl">{selectedCourt.name}</h2>
                </div>

                <div className="min-w-0 shrink-0 text-right">
                  <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${statusColor}`}>{statusLabel}</p>
                  {selectedMatch?.division?.name && (
                    <p className="mt-1 max-w-[22rem] break-words text-sm font-medium text-slate-400 md:text-base">
                      {selectedMatch.division.name}
                    </p>
                  )}
                </div>
              </div>

              {!selectedMatch ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <p className="text-center text-4xl font-bold text-slate-300 md:text-6xl">Awaiting Assignment</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 flex min-h-0 flex-1 flex-col justify-center gap-5 md:gap-6">
                    <div className="flex min-w-0 items-center justify-between gap-4 md:gap-6">
                      <p className="min-w-0 max-w-[68%] break-words text-[clamp(2.4rem,4.9vw,5.5rem)] font-semibold leading-[0.95] text-slate-100">
                        {sideAName}
                      </p>
                      {showScores && (
                        <p className={`${oswald.className} shrink-0 text-[clamp(4.5rem,12vw,12rem)] font-bold leading-none text-white tabular-nums`}>
                          {scoreA}
                        </p>
                      )}
                    </div>

                    <div className="h-px bg-gradient-to-r from-slate-700 via-slate-500 to-slate-700" />

                    <div className="flex min-w-0 items-center justify-between gap-4 md:gap-6">
                      <p className="min-w-0 max-w-[68%] break-words text-[clamp(2.4rem,4.9vw,5.5rem)] font-semibold leading-[0.95] text-slate-100">
                        {sideBName}
                      </p>
                      {showScores && (
                        <p className={`${oswald.className} shrink-0 text-[clamp(4.5rem,12vw,12rem)] font-bold leading-none text-white tabular-nums`}>
                          {scoreB}
                        </p>
                      )}
                    </div>
                  </div>

                  <footer className="mt-5 shrink-0 border-t border-slate-800 pt-4">
                    {isReady ? (
                      <p className="text-center text-2xl font-bold text-sky-300 md:text-3xl">Starting Soon</p>
                    ) : games.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {games.map((game, index) => (
                          <span
                            key={`${game.score_a}-${game.score_b}-${index}`}
                            className={`${oswald.className} rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xl text-slate-200 tabular-nums md:text-2xl`}
                          >
                            {game.score_a}-{game.score_b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-xl font-semibold text-slate-400 md:text-2xl">Match In Progress</p>
                    )}
                  </footer>
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {showCourtPicker && availableCourts.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90 p-4 md:p-6"
          onKeyDown={handleCourtPickerKeyDown}
        >
          <div className="flex h-full max-h-full w-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-4 md:p-6">
            <h3 className="text-center text-2xl font-bold text-slate-100 md:text-4xl">Select Court</h3>
            <p className="mt-1 text-center text-xs text-slate-400 md:text-sm">
              Use arrow keys and press Enter to choose.
            </p>

            <div className={cn("mt-4 grid flex-1 auto-rows-fr gap-3", pickerGridClassName)}>
              {availableCourts.map((court, index) => {
                const isSelected = court.id === selectedCourtId

                return (
                  <button
                    key={court.id}
                    ref={element => {
                      courtButtonRefs.current[index] = element
                    }}
                    type="button"
                    onClick={() => handleSelectCourt(court.id)}
                    tabIndex={focusedCourtIndex === index ? 0 : -1}
                    className={`flex min-h-0 flex-col justify-center rounded-xl border px-4 py-4 text-left outline-none transition ${
                      isSelected
                        ? "border-sky-400 bg-sky-950/40"
                        : "border-slate-700 bg-slate-900 hover:border-slate-500"
                    } focus-visible:ring-2 focus-visible:ring-sky-400`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Court</p>
                    <p className="mt-1 break-words text-[clamp(1.6rem,2.4vw,2.75rem)] font-bold leading-none text-slate-100">
                      {court.name}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
