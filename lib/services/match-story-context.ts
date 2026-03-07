import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getEntryDisplayName } from "@/lib/utils/display-name"
import {
  getKnockoutRoundCount,
  getKnockoutRoundLabel,
  getKnockoutVariant,
} from "@/lib/utils/knockout"
import type {
  Json,
  KnockoutVariant,
  MatchPhase,
  MatchScoreData,
  MatchStoryType,
  MatchStatus,
  WinnerSide,
} from "@/types/database"
import { TABLE_NAMES } from "@/types/database"

export const MATCH_STORY_PROMPT_VERSION = "v1"

interface TournamentRow {
  id: string
  name: string
}

interface DivisionRow {
  id: string
  tournament_id: string
  name: string
}

interface EntryRow {
  id: string
  participant?: { display_name: string; club?: string | null } | null
  team?: { name: string } | null
}

interface MatchRow {
  id: string
  division_id: string
  round: number
  sequence: number
  phase: MatchPhase
  status: MatchStatus
  winner_side: WinnerSide | null
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  next_match_id?: string | null
  next_match_side?: WinnerSide | null
  meta_json: MatchScoreData | null
  division?: DivisionRow | null
}

interface EntrySummaryResult {
  round_label: string
  opponent_name: string
  outcome: "won" | "lost"
  score_summary: string
}

interface EntrySummary {
  wins: number
  losses: number
  point_diff: number
  unbeaten: boolean
  has_bounce_back_win: boolean
  recent_results: EntrySummaryResult[]
}

interface SideContext {
  entry_id: string | null
  name: string | null
  potential_names: string[]
  potential_paths: string[]
  summary: EntrySummary | null
}

export interface MatchStoryGenerationInput {
  matchId: string
  storyType: MatchStoryType
  promptVersion: string
  contextJson: Json
  fallbackText: string
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function phaseOrder(phase: MatchPhase): number {
  return phase === "knockout" ? 1 : 0
}

function compareMatchOrder(a: MatchRow, b: MatchRow): number {
  const phaseDiff = phaseOrder(a.phase) - phaseOrder(b.phase)
  if (phaseDiff !== 0) return phaseDiff
  if (a.round !== b.round) return a.round - b.round
  return a.sequence - b.sequence
}

function getRoundLabel(
  match: Pick<MatchRow, "phase" | "round" | "division_id">,
  drawState: any
): string {
  if (match.phase !== "knockout") {
    return `Round ${match.round}`
  }

  const knockoutVariant = getKnockoutVariant(drawState?.knockout_variant)
  const totalRounds = getKnockoutRoundCount(drawState?.bracket_size, knockoutVariant) || match.round
  return getKnockoutRoundLabel(match.round, totalRounds, knockoutVariant)
}

function formatScoreSummary(scoreData: MatchScoreData | null): string {
  if (!scoreData) return "result pending"
  if (scoreData.walkover) return "by walkover"
  if ((scoreData as any).bye) return "by bye"
  if (!scoreData.games?.length) return "with no published scoreline"
  return scoreData.games.map(game => `${game.score_a}-${game.score_b}`).join(", ")
}

function getEntryName(entryId: string | null, entryMap: Map<string, EntryRow>): string | null {
  if (!entryId) return null
  const entry = entryMap.get(entryId)
  return getEntryDisplayName(entry ?? null)
}

function buildEntrySummary(
  entryId: string,
  completedMatches: MatchRow[],
  entryMap: Map<string, EntryRow>,
  drawState: any
): EntrySummary {
  const results = completedMatches
    .filter(match => match.side_a_entry_id === entryId || match.side_b_entry_id === entryId)
    .sort(compareMatchOrder)

  let wins = 0
  let losses = 0
  let pointsFor = 0
  let pointsAgainst = 0
  let sawLoss = false
  let hasBounceBackWin = false

  const recentResults: EntrySummaryResult[] = []

  for (const match of results) {
    const isSideA = match.side_a_entry_id === entryId
    const opponentId = isSideA ? match.side_b_entry_id : match.side_a_entry_id
    const opponentName = getEntryName(opponentId, entryMap) || "unknown opposition"
    const didWin = (isSideA && match.winner_side === "A") || (!isSideA && match.winner_side === "B")

    if (didWin) {
      wins++
      if (sawLoss) hasBounceBackWin = true
    } else {
      losses++
      sawLoss = true
    }

    const scoreData = match.meta_json as MatchScoreData | null
    const isBye = !match.side_b_entry_id || (scoreData as any)?.bye === true
    const isWalkover = scoreData?.walkover === true

    if (!isBye && !isWalkover && scoreData) {
      pointsFor += isSideA ? scoreData.total_points_a : scoreData.total_points_b
      pointsAgainst += isSideA ? scoreData.total_points_b : scoreData.total_points_a
    }

    recentResults.push({
      round_label: getRoundLabel(match, drawState),
      opponent_name: opponentName,
      outcome: didWin ? "won" : "lost",
      score_summary: formatScoreSummary(scoreData),
    })
  }

  return {
    wins,
    losses,
    point_diff: pointsFor - pointsAgainst,
    unbeaten: losses === 0 && wins > 0,
    has_bounce_back_win: hasBounceBackWin,
    recent_results: recentResults.slice(-3).reverse(),
  }
}

function buildPotentialPaths(
  targetMatch: MatchRow,
  side: WinnerSide,
  divisionMatches: MatchRow[],
  entryMap: Map<string, EntryRow>,
  drawState: any
): { potentialNames: string[]; potentialPaths: string[] } {
  const feederMatches = divisionMatches
    .filter(match => match.next_match_id === targetMatch.id && match.next_match_side === side)
    .sort(compareMatchOrder)

  const potentialNames = Array.from(new Set(
    feederMatches.flatMap(match => [
      getEntryName(match.side_a_entry_id, entryMap),
      getEntryName(match.side_b_entry_id, entryMap),
    ].filter((value): value is string => Boolean(value)))
  ))

  const potentialPaths = feederMatches.map(match => {
    const roundLabel = getRoundLabel(match, drawState)
    const sideAName = getEntryName(match.side_a_entry_id, entryMap)
    const sideBName = getEntryName(match.side_b_entry_id, entryMap)

    if (sideAName && sideBName) return `${roundLabel}: ${sideAName} vs ${sideBName}`
    return `${roundLabel} feeder`
  })

  return { potentialNames, potentialPaths }
}

function buildSideContext(
  targetMatch: MatchRow,
  side: WinnerSide,
  divisionMatches: MatchRow[],
  completedMatches: MatchRow[],
  entryMap: Map<string, EntryRow>,
  drawState: any
): SideContext {
  const entryId = side === "A" ? targetMatch.side_a_entry_id : targetMatch.side_b_entry_id
  const name = getEntryName(entryId, entryMap)

  if (entryId) {
    return {
      entry_id: entryId,
      name,
      potential_names: [],
      potential_paths: [],
      summary: buildEntrySummary(entryId, completedMatches, entryMap, drawState),
    }
  }

  const { potentialNames, potentialPaths } = buildPotentialPaths(targetMatch, side, divisionMatches, entryMap, drawState)

  return {
    entry_id: null,
    name: null,
    potential_names: potentialNames,
    potential_paths: potentialPaths,
    summary: null,
  }
}

function buildHeadToHead(
  targetMatch: MatchRow,
  completedMatches: MatchRow[],
  entryMap: Map<string, EntryRow>,
  drawState: any
) {
  if (!targetMatch.side_a_entry_id || !targetMatch.side_b_entry_id) return []

  return completedMatches
    .filter(match => match.phase === "swiss")
    .filter(match => {
      const pair = [match.side_a_entry_id, match.side_b_entry_id]
      return pair.includes(targetMatch.side_a_entry_id) && pair.includes(targetMatch.side_b_entry_id)
    })
    .sort(compareMatchOrder)
    .map(match => {
      const winnerName = match.winner_side === "A"
        ? getEntryName(match.side_a_entry_id, entryMap)
        : getEntryName(match.side_b_entry_id, entryMap)

      return {
        round_label: getRoundLabel(match, drawState),
        winner_name: winnerName,
        score_summary: formatScoreSummary(match.meta_json),
      }
    })
}

function buildPostMatchResult(targetMatch: MatchRow, entryMap: Map<string, EntryRow>) {
  const winnerName = targetMatch.winner_side === "A"
    ? getEntryName(targetMatch.side_a_entry_id, entryMap)
    : getEntryName(targetMatch.side_b_entry_id, entryMap)
  const loserName = targetMatch.winner_side === "A"
    ? getEntryName(targetMatch.side_b_entry_id, entryMap)
    : getEntryName(targetMatch.side_a_entry_id, entryMap)

  return {
    winner_name: winnerName,
    loser_name: loserName,
    score_summary: formatScoreSummary(targetMatch.meta_json),
    is_walkover: targetMatch.meta_json?.walkover === true,
  }
}

function buildPreMatchFallback(context: any): string {
  const roundLabel = context.round_label
  const divisionName = context.division_name
  const tournamentName = context.tournament_name
  const sideA = context.side_a
  const sideB = context.side_b

  if (context.phase === "knockout" && context.is_final && sideA.name && sideB.name) {
    return `${sideA.name} and ${sideB.name} step into the ${divisionName} final at ${tournamentName}. One more win decides the title.`
  }

  if (sideA.name && sideB.name) {
    const opening = `${sideA.name} and ${sideB.name} meet in ${divisionName} ${roundLabel} at ${tournamentName}.`
    if (context.head_to_head?.length) {
      const latest = context.head_to_head[context.head_to_head.length - 1]
      return `${opening} They have already crossed paths once in Swiss play, with ${latest.winner_name} taking the earlier meeting ${latest.score_summary}.`
    }
    return `${opening} This matchup adds a fresh chapter to the division story as the tournament moves forward.`
  }

  return `This ${divisionName} ${roundLabel} matchup is taking shape at ${tournamentName}. The winners from the feeder matches will carry the next piece of the bracket story into view.`
}

function buildPostMatchFallback(context: any): string {
  const result = context.post_match_result
  const divisionName = context.division_name
  const roundLabel = context.round_label
  const tournamentName = context.tournament_name

  if (result?.winner_name && result?.is_walkover) {
    return `${result.winner_name} advances in the ${divisionName} ${roundLabel} at ${tournamentName} by walkover. The bracket moves on without a played finish.`
  }

  if (result?.winner_name && result?.loser_name) {
    return `${result.winner_name} beats ${result.loser_name} ${result.score_summary} in the ${divisionName} ${roundLabel} at ${tournamentName}. That result pushes the tournament story into its next stage.`
  }

  return `The ${divisionName} ${roundLabel} is complete at ${tournamentName}. The result is in, and the bracket now turns toward the next test.`
}

export async function buildMatchStoryInputs(
  matchIds: string[],
  storyType: MatchStoryType
): Promise<MatchStoryGenerationInput[]> {
  if (matchIds.length === 0) return []

  const supabase = createAdminClient()

  const { data: targetMatches, error: matchError } = await supabase
    .from(TABLE_NAMES.MATCHES)
    .select(`
      id, division_id, round, sequence, phase, status, winner_side,
      side_a_entry_id, side_b_entry_id, meta_json,
      division:bracket_blaze_divisions!inner(id, tournament_id, name)
    `)
    .in("id", matchIds)

  if (matchError || !targetMatches?.length) {
    throw new Error(matchError?.message || "Failed to load matches for story generation")
  }

  const normalizedMatches = targetMatches.map(match => ({
    ...(match as any),
    division: normalizeRelation((match as any).division),
  })) as MatchRow[]

  const divisionIds = Array.from(new Set(normalizedMatches.map(match => match.division_id)))
  const tournamentIds = Array.from(new Set(
    normalizedMatches
      .map(match => match.division?.tournament_id)
      .filter((value): value is string => Boolean(value))
  ))

  const [{ data: draws }, { data: entries }, { data: divisionMatches }, { data: tournaments }] = await Promise.all([
    supabase
      .from(TABLE_NAMES.DRAWS)
      .select("division_id, state_json")
      .in("division_id", divisionIds),
    supabase
      .from(TABLE_NAMES.ENTRIES)
      .select(`
        id, division_id,
        participant:bracket_blaze_participants(display_name, club),
        team:bracket_blaze_teams(name)
      `)
      .in("division_id", divisionIds),
    supabase
      .from(TABLE_NAMES.MATCHES)
      .select(`
        id, division_id, round, sequence, phase, status, winner_side,
        side_a_entry_id, side_b_entry_id, next_match_id, next_match_side, meta_json
      `)
      .in("division_id", divisionIds),
    supabase
      .from(TABLE_NAMES.TOURNAMENTS)
      .select("id, name")
      .in("id", tournamentIds),
  ])

  const drawMap = new Map((draws || []).map(draw => [draw.division_id, draw.state_json]))
  const tournamentMap = new Map((tournaments || []).map(tournament => [tournament.id, tournament as TournamentRow]))

  const entryMapByDivision = new Map<string, Map<string, EntryRow>>()
  for (const entry of entries || []) {
    const entryRow = entry as any
    const divisionId = entryRow.division_id as string | undefined
    if (!divisionId) continue
    if (!entryMapByDivision.has(divisionId)) entryMapByDivision.set(divisionId, new Map())
    entryMapByDivision.get(divisionId)!.set(entryRow.id, entryRow as EntryRow)
  }

  const matchesByDivision = new Map<string, MatchRow[]>()
  for (const match of divisionMatches || []) {
    const row = match as MatchRow
    if (!matchesByDivision.has(row.division_id)) matchesByDivision.set(row.division_id, [])
    matchesByDivision.get(row.division_id)!.push(row)
  }

  return normalizedMatches.map(match => {
    const division = match.division
    if (!division) {
      throw new Error(`Missing division for match ${match.id}`)
    }

    const tournamentName = tournamentMap.get(division.tournament_id)?.name || "this tournament"
    const drawState = drawMap.get(match.division_id)
    const divisionEntryMap = entryMapByDivision.get(match.division_id) || new Map<string, EntryRow>()
    const divisionMatchRows = matchesByDivision.get(match.division_id) || []
    const completedMatches = divisionMatchRows
      .filter(row => row.id !== match.id)
      .filter(row => row.status === "completed" || row.status === "walkover")
      .sort(compareMatchOrder)

    const roundLabel = getRoundLabel(match, drawState)
    const sideA = buildSideContext(match, "A", divisionMatchRows, completedMatches, divisionEntryMap, drawState)
    const sideB = buildSideContext(match, "B", divisionMatchRows, completedMatches, divisionEntryMap, drawState)
    const contextJson = ({
      tournament_name: tournamentName,
      division_name: division.name,
      phase: match.phase,
      round_label: roundLabel,
      is_final: roundLabel === "Final",
      side_a: sideA,
      side_b: sideB,
      head_to_head: buildHeadToHead(match, completedMatches, divisionEntryMap, drawState),
      post_match_result: storyType === "post_match" ? buildPostMatchResult(match, divisionEntryMap) : null,
    } as unknown) as Json

    return {
      matchId: match.id,
      storyType,
      promptVersion: MATCH_STORY_PROMPT_VERSION,
      contextJson,
      fallbackText: storyType === "post_match"
        ? buildPostMatchFallback(contextJson)
        : buildPreMatchFallback(contextJson),
    }
  })
}
