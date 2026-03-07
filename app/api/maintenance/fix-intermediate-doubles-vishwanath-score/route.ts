import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { calculateStandings } from "@/lib/services/standings-engine"

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

    for (const round of [2, 3]) {
      const { error } = await calculateStandings(DIVISION_ID, round, supabase)
      if (error && error !== "No completed matches found") {
        return NextResponse.json(
          { error: `Failed to refresh standings for round ${round}: ${error}` },
          { status: 500 }
        )
      }
    }

    const { data: standings, error: standingsError } = await supabase
      .from("bracket_blaze_standings")
      .select("entry_id, round, wins, losses, points_for, points_against, point_diff, rank")
      .eq("division_id", DIVISION_ID)
      .in("entry_id", [SIDE_A_ENTRY_ID, SIDE_B_ENTRY_ID])
      .in("round", [2, 3])
      .order("round", { ascending: true })
      .order("rank", { ascending: true })

    if (standingsError) {
      return NextResponse.json({ error: standingsError.message }, { status: 500 })
    }

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
