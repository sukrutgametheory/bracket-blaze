import "server-only"

import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  MATCH_STORY_PROMPT_VERSION,
  buildMatchStoryInputs,
} from "@/lib/services/match-story-context"
import { generateMatchStory } from "@/lib/services/match-story-generator"
import type { MatchStoryType } from "@/types/database"
import { TABLE_NAMES } from "@/types/database"

interface ExistingStoryRow {
  match_id: string
  story_type: MatchStoryType
  status: string
  version: number
  content: string | null
}

interface StoryScheduleOptions {
  force?: boolean
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function fetchExistingStories(
  matchIds: string[],
  storyType: MatchStoryType
): Promise<Map<string, ExistingStoryRow>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from(TABLE_NAMES.MATCH_STORIES)
    .select("match_id, story_type, status, version, content")
    .in("match_id", matchIds)
    .eq("story_type", storyType)

  return new Map((data || []).map(row => [row.match_id, row as ExistingStoryRow]))
}

async function prepareStories(
  matchIds: string[],
  storyType: MatchStoryType,
  options: StoryScheduleOptions = {}
): Promise<string[]> {
  const uniqueMatchIds = Array.from(new Set(matchIds))
  if (uniqueMatchIds.length === 0) return []

  const existingMap = await fetchExistingStories(uniqueMatchIds, storyType)
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const rowsToUpsert: Record<string, unknown>[] = []
  const idsToGenerate: string[] = []

  for (const matchId of uniqueMatchIds) {
    const existing = existingMap.get(matchId)

    if (!existing) {
      rowsToUpsert.push({
        match_id: matchId,
        story_type: storyType,
        status: "pending",
        version: 1,
        prompt_version: MATCH_STORY_PROMPT_VERSION,
        invalidated_at: null,
        error_code: null,
        error_message: null,
        generated_at: null,
        updated_at: now,
      })
      idsToGenerate.push(matchId)
      continue
    }

    const shouldRefresh = options.force || existing.status === "failed" || existing.status === "stale" || !existing.content
    if (!shouldRefresh) continue

    rowsToUpsert.push({
      match_id: matchId,
      story_type: storyType,
      status: "pending",
      version: existing.version + 1,
      prompt_version: MATCH_STORY_PROMPT_VERSION,
      invalidated_at: existing.status === "stale" || options.force ? now : null,
      error_code: null,
      error_message: null,
      updated_at: now,
    })
    idsToGenerate.push(matchId)
  }

  if (rowsToUpsert.length > 0) {
    const { error } = await supabase
      .from(TABLE_NAMES.MATCH_STORIES)
      .upsert(rowsToUpsert, { onConflict: "match_id,story_type" })

    if (error) {
      console.error("Failed to prepare match stories:", error)
      return []
    }
  }

  return idsToGenerate
}

async function markGenerating(matchIds: string[], storyType: MatchStoryType) {
  if (matchIds.length === 0) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLE_NAMES.MATCH_STORIES)
    .update({
      status: "generating",
      error_code: null,
      error_message: null,
    })
    .in("match_id", matchIds)
    .eq("story_type", storyType)

  if (error) {
    console.error("Failed to mark match stories as generating:", error)
  }
}

async function persistGeneratedStory(
  matchId: string,
  storyType: MatchStoryType,
  payload: Record<string, unknown>
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLE_NAMES.MATCH_STORIES)
    .update(payload)
    .eq("match_id", matchId)
    .eq("story_type", storyType)

  if (error) {
    console.error(`Failed to persist ${storyType} story for ${matchId}:`, error)
  }
}

async function generateStories(matchIds: string[], storyType: MatchStoryType) {
  if (matchIds.length === 0) return

  const inputs = await buildMatchStoryInputs(matchIds, storyType)
  if (inputs.length === 0) return

  await markGenerating(inputs.map(input => input.matchId), storyType)

  for (const batch of chunk(inputs, 3)) {
    await Promise.all(batch.map(async input => {
      const generated = await generateMatchStory(input)
      await persistGeneratedStory(input.matchId, storyType, {
        status: generated.status === "ready" ? "ready" : "failed",
        content: generated.content,
        model_slug: generated.modelSlug,
        prompt_version: input.promptVersion,
        context_json: input.contextJson,
        error_code: generated.errorCode,
        error_message: generated.errorMessage,
        generated_at: new Date().toISOString(),
        invalidated_at: null,
      })
    }))
  }
}

export async function markMatchStoriesStale(matchIds: string[], storyType: MatchStoryType) {
  const uniqueMatchIds = Array.from(new Set(matchIds)).filter(Boolean)
  if (uniqueMatchIds.length === 0) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLE_NAMES.MATCH_STORIES)
    .update({
      status: "stale",
      invalidated_at: new Date().toISOString(),
    })
    .in("match_id", uniqueMatchIds)
    .eq("story_type", storyType)

  if (error) {
    console.error("Failed to mark match stories stale:", error)
  }
}

export async function ensureAndScheduleMatchStories(
  matchIds: string[],
  storyType: MatchStoryType,
  options: StoryScheduleOptions = {}
) {
  const idsToGenerate = await prepareStories(matchIds, storyType, options)
  if (idsToGenerate.length === 0) return

  after(() => generateStories(idsToGenerate, storyType).catch(error => {
    console.error(`Failed to generate ${storyType} stories:`, error)
  }))
}
