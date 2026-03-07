import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPersistedStandings } from "@/lib/services/standings-engine"

const TOURNAMENT_ID = "9921d16d-fb68-4778-ae70-60c90f30d375"
const DIVISION_ID = "b75b3ba3-0e71-4863-ae8a-df3cab468ecb"
const MATCH_ID = "5a8a6e91-59d4-4dc1-a6b6-18e8d6400287"
const SIDE_A_ENTRY_ID = "b6f8403f-3c8c-4c15-bd58-19c46779bf00"
const SIDE_B_ENTRY_ID = "25268900-5803-45cd-b084-9d08672a37a5"

const TARGET_META_JSON = {
  games: [{ score_a: 21, score_b: 14 }],
  total_points_a: 21,
  total_points_b: 14,
}

const TARGET_STANDINGS = [
  { round: 2, entryId: SIDE_A_ENTRY_ID, pointsFor: 42, pointsAgainst: 17, pointDiff: 25 },
  { round: 2, entryId: SIDE_B_ENTRY_ID, pointsFor: 35, pointsAgainst: 41, pointDiff: -6 },
  { round: 3, entryId: SIDE_A_ENTRY_ID, pointsFor: 63, pointsAgainst: 35, pointDiff: 28 },
  { round: 3, entryId: SIDE_B_ENTRY_ID, pointsFor: 56, pointsAgainst: 46, pointDiff: 10 },
] as const

function readScore(metaJson: unknown) {
  const games = (metaJson as { games?: Array<{ score_a?: number; score_b?: number }> } | null)?.games
  const firstGame = Array.isArray(games) ? games[0] : null

  if (!firstGame || typeof firstGame.score_a !== "number" || typeof firstGame.score_b !== "number") {
    return null
  }

  return `${firstGame.score_a}-${firstGame.score_b}`
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: match, error: matchError } = await supabase
      .from("bracket_blaze_matches")
      .select("id, division_id, status, phase, round, winner_side, side_a_entry_id, side_b_entry_id, meta_json")
      .eq("id", MATCH_ID)
      .single()

    if (matchError || !match) {
      return NextResponse.json(
        { error: matchError?.message || "Match not found" },
        { status: 500 }
      )
    }

    if (
      match.division_id !== DIVISION_ID ||
      match.status !== "completed" ||
      match.phase !== "swiss" ||
      match.round !== 2 ||
      match.winner_side !== "A" ||
      match.side_a_entry_id !== SIDE_A_ENTRY_ID ||
      match.side_b_entry_id !== SIDE_B_ENTRY_ID
    ) {
      return NextResponse.json(
        {
          error: "Match state did not match the expected Intermediate Doubles Round 2 record",
          match,
        },
        { status: 409 }
      )
    }

    const previousScore = readScore(match.meta_json)
    if (previousScore !== "21-13" && previousScore !== "21-14") {
      return NextResponse.json(
        {
          error: "Unexpected existing score; refusing to mutate",
          previousScore,
        },
        { status: 409 }
      )
    }

    if (previousScore === "21-13") {
      const { error: updateError } = await supabase
        .from("bracket_blaze_matches")
        .update({ meta_json: TARGET_META_JSON })
        .eq("id", MATCH_ID)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    const { data: standingsRows, error: standingsFetchError } = await supabase
      .from("bracket_blaze_standings")
      .select("entry_id, round, tiebreak_json")
      .eq("division_id", DIVISION_ID)
      .in("entry_id", [SIDE_A_ENTRY_ID, SIDE_B_ENTRY_ID])
      .in("round", [2, 3])

    if (standingsFetchError) {
      return NextResponse.json({ error: standingsFetchError.message }, { status: 500 })
    }

    if (!standingsRows || standingsRows.length !== 4) {
      return NextResponse.json(
        { error: "Unexpected standings snapshot shape", standingsRows },
        { status: 409 }
      )
    }

    for (const target of TARGET_STANDINGS) {
      const existing = standingsRows.find(
        (row) => row.entry_id === target.entryId && row.round === target.round
      )

      if (!existing) {
        return NextResponse.json(
          { error: "Missing standings row for score correction", target },
          { status: 409 }
        )
      }

      const currentTiebreak = (existing.tiebreak_json as Record<string, unknown> | null) ?? {}
      const h2hResults = (currentTiebreak.h2h_results as Record<string, "W" | "L"> | undefined) ?? {}

      const { error: standingsUpdateError } = await supabase
        .from("bracket_blaze_standings")
        .update({
          points_for: target.pointsFor,
          points_against: target.pointsAgainst,
          tiebreak_json: {
            ...currentTiebreak,
            point_diff: target.pointDiff,
            h2h_results: h2hResults,
          },
        })
        .eq("division_id", DIVISION_ID)
        .eq("entry_id", target.entryId)
        .eq("round", target.round)

      if (standingsUpdateError) {
        return NextResponse.json(
          { error: standingsUpdateError.message, target },
          { status: 500 }
        )
      }
    }

    const { standings: round2Standings, error: round2Error } = await getPersistedStandings(DIVISION_ID, 2, supabase)
    const { standings: round3Standings, error: round3Error } = await getPersistedStandings(DIVISION_ID, 3, supabase)

    if (round2Error) {
      return NextResponse.json({ error: round2Error }, { status: 500 })
    }

    if (round3Error) {
      return NextResponse.json({ error: round3Error }, { status: 500 })
    }

    const standings = [
      ...round2Standings.map((row) => ({ ...row, round: 2 })),
      ...round3Standings.map((row) => ({ ...row, round: 3 })),
    ]
      .filter((row) => row.entry_id === SIDE_A_ENTRY_ID || row.entry_id === SIDE_B_ENTRY_ID)
      .map((row) => ({
        entry_id: row.entry_id,
        round: row.round,
        wins: row.wins,
        losses: row.losses,
        points_for: row.points_for,
        points_against: row.points_against,
        point_diff: row.tiebreak_json.point_diff,
        rank: row.rank,
      }))

    revalidatePath(`/live/${TOURNAMENT_ID}`)
    revalidatePath(`/tournaments/${TOURNAMENT_ID}/control-center`)
    revalidatePath(`/tournaments/${TOURNAMENT_ID}/divisions/${DIVISION_ID}/matches`)

    return NextResponse.json({
      success: true,
      updated: previousScore === "21-13",
      previousScore,
      currentScore: "21-14",
      fixturesChanged: false,
      standings,
    })
  } catch (error) {
    console.error("Failed to fix Intermediate Doubles score:", error)
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
