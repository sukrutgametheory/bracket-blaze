import "server-only"

import type { MatchStoryStatus } from "@/types/database"
import type { MatchStoryGenerationInput } from "@/lib/services/match-story-context"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const OPENROUTER_MODEL = "openai/gpt-oss-120b"

interface GeneratedStoryResult {
  content: string
  status: MatchStoryStatus
  modelSlug: string | null
  errorCode: string | null
  errorMessage: string | null
}

function normalizeStoryText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function parseJsonContent(content: string): string | null {
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed?.text === "string") return normalizeStoryText(parsed.text)
  } catch {
    return null
  }
  return null
}

async function callOpenRouter(input: MatchStoryGenerationInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const payload = {
    model: OPENROUTER_MODEL,
    temperature: 0.5,
    max_tokens: 220,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You write short spectator commentary for a live racquet-sports tournament portal.",
          "Return valid JSON with a single key: text.",
          "Write 2 to 4 short sentences.",
          "Stay grounded in the provided facts. Do not invent injuries, momentum swings, crowd reactions, or past matches that are not in the input.",
          "Use emojis sparingly: 0 or 1 max.",
          "If the information is limited, stay concise and specific to tournament, division, and round."
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          story_type: input.storyType,
          context: input.contextJson,
        }),
      },
    ],
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bracket-blaze.vercel.app",
        "X-OpenRouter-Title": "Bracket Blaze Match Stories",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text()
      const retryable = response.status === 429 || response.status === 502 || response.status === 503
      lastError = new Error(`OpenRouter ${response.status}: ${body}`)
      if (retryable && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)))
        continue
      }
      throw lastError
    }

    const json = await response.json()
    const content = json?.choices?.[0]?.message?.content

    if (typeof content === "string") {
      const parsed = parseJsonContent(content)
      if (parsed) return parsed
      const normalized = normalizeStoryText(content)
      if (normalized) return normalized
    }

    lastError = new Error("OpenRouter returned an empty or invalid response")
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)))
      continue
    }
  }

  throw lastError || new Error("OpenRouter request failed")
}

export async function generateMatchStory(input: MatchStoryGenerationInput): Promise<GeneratedStoryResult> {
  try {
    const content = await callOpenRouter(input)
    return {
      content,
      status: "ready",
      modelSlug: OPENROUTER_MODEL,
      errorCode: null,
      errorMessage: null,
    }
  } catch (error) {
    return {
      content: input.fallbackText,
      status: "failed",
      modelSlug: null,
      errorCode: "generation_failed",
      errorMessage: error instanceof Error ? error.message : "Unknown generation error",
    }
  }
}
