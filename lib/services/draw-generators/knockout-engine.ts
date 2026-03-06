/**
 * Knockout Bracket Engine
 *
 * Generates single-elimination brackets from Swiss qualifiers.
 * Handles seeded bracket positioning so top seeds meet latest.
 */

import type { KnockoutVariant } from "@/types/database"
import {
  DEFAULT_KNOCKOUT_VARIANT,
  PRE_QUARTER_QUALIFIER_COUNT,
  getKnockoutRoundLabel as getRoundLabel,
  isPowerOf2,
} from "@/lib/utils/knockout"

interface KnockoutMatch {
  division_id: string
  round: number
  sequence: number
  phase: 'knockout'
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  next_match_id?: string
  next_match_side?: 'A' | 'B'
  status: 'scheduled'
}

interface Qualifier {
  entry_id: string
  rank: number // 1-based rank from Swiss standings
}

/**
 * Generate standard seeded bracket positions.
 *
 * For a bracket of size N (power of 2), returns array of [seedA, seedB] pairs.
 * Seeds are 1-based.
 */
function generateBracketSeedings(size: number): [number, number][] {
  if (size === 2) return [[1, 2]]

  const pairings: [number, number][] = []
  let seeds = [1]

  while (seeds.length < size) {
    const nextRoundSize = seeds.length * 2
    const newSeeds: number[] = []
    for (const seed of seeds) {
      newSeeds.push(seed)
      newSeeds.push(nextRoundSize + 1 - seed)
    }
    seeds = newSeeds
  }

  for (let i = 0; i < seeds.length; i += 2) {
    pairings.push([seeds[i], seeds[i + 1]])
  }

  return pairings
}

function bracketRounds(size: number): number {
  return Math.log2(size)
}

function createMatch(
  divisionId: string,
  round: number,
  sequence: number,
  sideAEntryId: string | null,
  sideBEntryId: string | null
): KnockoutMatch {
  return {
    division_id: divisionId,
    round,
    sequence,
    phase: 'knockout',
    side_a_entry_id: sideAEntryId,
    side_b_entry_id: sideBEntryId,
    status: 'scheduled',
  }
}

function buildStandardBracketStructure(
  divisionId: string,
  seedEntryMap: Map<number, string | null>,
  size: number,
  roundOffset = 0
): {
  matches: KnockoutMatch[]
  positionMap: Map<string, number>
} {
  const totalRounds = bracketRounds(size)
  const matches: KnockoutMatch[] = []
  const positionMap = new Map<string, number>()
  let matchIndex = 0

  const seedings = generateBracketSeedings(size)
  for (let seq = 0; seq < seedings.length; seq++) {
    const [seedA, seedB] = seedings[seq]
    const actualRound = 1 + roundOffset
    const key = `${actualRound}-${seq + 1}`

    matches.push(createMatch(
      divisionId,
      actualRound,
      seq + 1,
      seedEntryMap.get(seedA) ?? null,
      seedEntryMap.get(seedB) ?? null
    ))

    positionMap.set(key, matchIndex)
    matchIndex++
  }

  for (let round = 2; round <= totalRounds; round++) {
    const actualRound = round + roundOffset
    const matchesInRound = size / Math.pow(2, round)

    for (let seq = 1; seq <= matchesInRound; seq++) {
      const key = `${actualRound}-${seq}`
      matches.push(createMatch(divisionId, actualRound, seq, null, null))
      positionMap.set(key, matchIndex)
      matchIndex++
    }
  }

  for (let round = 1; round < totalRounds; round++) {
    const actualRound = round + roundOffset
    const nextRound = actualRound + 1
    const matchesInRound = size / Math.pow(2, round)

    for (let seq = 1; seq <= matchesInRound; seq++) {
      const currentKey = `${actualRound}-${seq}`
      const nextSeq = Math.ceil(seq / 2)
      const nextKey = `${nextRound}-${nextSeq}`
      const nextSide: 'A' | 'B' = seq % 2 === 1 ? 'A' : 'B'

      const currentIdx = positionMap.get(currentKey)!
      matches[currentIdx].next_match_side = nextSide
      ;(matches[currentIdx] as any)._next_match_key = nextKey
    }
  }

  return { matches, positionMap }
}

function buildStandardSeedEntryMap(qualifiers: Qualifier[]): Map<number, string | null> {
  return new Map(qualifiers.map(q => [q.rank, q.entry_id]))
}

function generatePreQuarter12BracketStructure(
  divisionId: string,
  qualifiers: Qualifier[]
): {
  matches: KnockoutMatch[]
  positionMap: Map<string, number>
} {
  if (qualifiers.length !== PRE_QUARTER_QUALIFIER_COUNT) {
    throw new Error(`Pre Quarter knockout requires ${PRE_QUARTER_QUALIFIER_COUNT} qualifiers, got ${qualifiers.length}`)
  }

  const qualifierMap = new Map(qualifiers.map(q => [q.rank, q.entry_id]))
  const quarterFinalSeedMap = new Map<number, string | null>([
    [1, qualifierMap.get(1) ?? null],
    [2, qualifierMap.get(2) ?? null],
    [3, qualifierMap.get(3) ?? null],
    [4, qualifierMap.get(4) ?? null],
    [5, null],
    [6, null],
    [7, null],
    [8, null],
  ])

  const { matches: seededMatches, positionMap } = buildStandardBracketStructure(
    divisionId,
    quarterFinalSeedMap,
    8,
    1
  )

  const preQuarterConfigs = [
    { sequence: 1, seedA: 5, seedB: 12, nextMatchKey: '2-2' },
    { sequence: 2, seedA: 6, seedB: 11, nextMatchKey: '2-4' },
    { sequence: 3, seedA: 7, seedB: 10, nextMatchKey: '2-3' },
    { sequence: 4, seedA: 8, seedB: 9, nextMatchKey: '2-1' },
  ]

  const preQuarterMatches = preQuarterConfigs.map((config, index) => {
    const match = createMatch(
      divisionId,
      1,
      config.sequence,
      qualifierMap.get(config.seedA) ?? null,
      qualifierMap.get(config.seedB) ?? null
    )
    match.next_match_side = 'B'
    ;(match as any)._next_match_key = config.nextMatchKey
    positionMap.set(`1-${config.sequence}`, index)
    return match
  })

  const combinedMatches = [...preQuarterMatches, ...seededMatches]
  seededMatches.forEach((_, index) => {
    const match = seededMatches[index]
    positionMap.set(`${match.round}-${match.sequence}`, preQuarterMatches.length + index)
  })

  return {
    matches: combinedMatches,
    positionMap,
  }
}

/**
 * Generate a full knockout bracket.
 */
export function generateKnockoutBracketStructure(
  divisionId: string,
  qualifiers: Qualifier[],
  variant: KnockoutVariant = DEFAULT_KNOCKOUT_VARIANT
): {
  matches: KnockoutMatch[]
  positionMap: Map<string, number>
} {
  if (variant === 'pre_quarter_12') {
    return generatePreQuarter12BracketStructure(divisionId, qualifiers)
  }

  const size = qualifiers.length
  if (size <= 0 || !isPowerOf2(size)) {
    throw new Error(`Qualifier count must be a power of 2, got ${size}`)
  }

  return buildStandardBracketStructure(
    divisionId,
    buildStandardSeedEntryMap(qualifiers),
    size
  )
}

export function getKnockoutRoundLabel(
  round: number,
  totalRounds: number,
  variant: KnockoutVariant = DEFAULT_KNOCKOUT_VARIANT
): string {
  return getRoundLabel(round, totalRounds, variant)
}
