/**
 * Knockout Bracket Engine
 *
 * Generates single-elimination brackets from Swiss qualifiers.
 * Handles seeded bracket positioning so top seeds meet latest.
 *
 * Qualifier count must be a power of 2 (2, 4, 8, 16, 32).
 */

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
 * Seeds are 1-based. The bracket ensures:
 * - Seed 1 and 2 can only meet in the final
 * - Seeds 1-4 can only meet in semis or later
 * - Standard bracket progression
 *
 * For 8 players: [[1,8], [4,5], [2,7], [3,6]]
 */
function generateBracketSeedings(size: number): [number, number][] {
  if (size === 2) return [[1, 2]]

  // Recursive bracket building
  // For each round, the bracket follows: if seed S is in position P,
  // they play against seed (bracketSize + 1 - S)
  const pairings: [number, number][] = []

  // Use the standard bracket algorithm
  // Start with [1] and iteratively expand
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

  // Pair consecutive entries
  for (let i = 0; i < seeds.length; i += 2) {
    pairings.push([seeds[i], seeds[i + 1]])
  }

  return pairings
}

/**
 * Calculate the number of rounds needed for a bracket
 */
function bracketRounds(size: number): number {
  return Math.log2(size)
}

/**
 * Generate a full knockout bracket.
 *
 * Creates all matches for all rounds:
 * - Round 1: All qualifier matchups populated
 * - Rounds 2+: Empty slots with next_match linkage
 *
 * Returns the matches to insert (without IDs — those are assigned by DB).
 * After insert, the caller must update next_match_id references.
 */
export function generateKnockoutBracketStructure(
  divisionId: string,
  qualifiers: Qualifier[]
): {
  matches: KnockoutMatch[]
  // Map of "round-sequence" to the match at that position, for linkage
  positionMap: Map<string, number> // key → index in matches array
} {
  const size = qualifiers.length

  // Validate power of 2
  if (size <= 0 || (size & (size - 1)) !== 0) {
    throw new Error(`Qualifier count must be a power of 2, got ${size}`)
  }

  const totalRounds = bracketRounds(size)
  const matches: KnockoutMatch[] = []
  const positionMap = new Map<string, number>()

  // Build qualifier lookup: rank → entry_id
  const qualifierMap = new Map(qualifiers.map(q => [q.rank, q.entry_id]))

  // Generate Round 1 with seeded pairings
  const seedings = generateBracketSeedings(size)
  let matchIndex = 0

  for (let seq = 0; seq < seedings.length; seq++) {
    const [seedA, seedB] = seedings[seq]
    const key = `1-${seq + 1}`

    matches.push({
      division_id: divisionId,
      round: 1,
      sequence: seq + 1,
      phase: 'knockout',
      side_a_entry_id: qualifierMap.get(seedA) || null,
      side_b_entry_id: qualifierMap.get(seedB) || null,
      status: 'scheduled',
    })

    positionMap.set(key, matchIndex)
    matchIndex++
  }

  // Generate subsequent rounds (empty slots)
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round)

    for (let seq = 1; seq <= matchesInRound; seq++) {
      const key = `${round}-${seq}`

      matches.push({
        division_id: divisionId,
        round,
        sequence: seq,
        phase: 'knockout',
        side_a_entry_id: null,
        side_b_entry_id: null,
        status: 'scheduled',
      })

      positionMap.set(key, matchIndex)
      matchIndex++
    }
  }

  // Set up next_match linkage
  // Each match in round R, sequence S feeds into round R+1, sequence ceil(S/2)
  // If S is odd → side A of next match; if S is even → side B
  for (let round = 1; round < totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round)

    for (let seq = 1; seq <= matchesInRound; seq++) {
      const currentKey = `${round}-${seq}`
      const nextSeq = Math.ceil(seq / 2)
      const nextKey = `${round + 1}-${nextSeq}`
      const nextSide: 'A' | 'B' = seq % 2 === 1 ? 'A' : 'B'

      const currentIdx = positionMap.get(currentKey)!
      // Store linkage info — next_match_id will be set after DB insert
      matches[currentIdx].next_match_side = nextSide
      // Store the target position key temporarily in next_match_id
      // The caller will resolve this to actual DB IDs after insert
      ;(matches[currentIdx] as any)._next_match_key = nextKey
    }
  }

  return { matches, positionMap }
}

/**
 * Get the display label for a knockout round
 */
export function getKnockoutRoundLabel(round: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - round
  if (roundsFromEnd === 0) return 'Final'
  if (roundsFromEnd === 1) return 'Semi-Final'
  if (roundsFromEnd === 2) return 'Quarter-Final'
  return `Round of ${Math.pow(2, roundsFromEnd + 1)}`
}
