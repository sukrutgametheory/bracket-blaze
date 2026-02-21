/**
 * Swiss Pairing Algorithm
 *
 * Generates fair pairings for Swiss system tournaments:
 * - Round 1: Seed-based pairing (1 vs bottom half, 2 vs bottom half-1, etc.)
 * - Later rounds: Pair players with similar scores, avoid rematches
 *
 * Features:
 * - Avoids repeat opponents
 * - Matches players by score/standing
 * - Handles byes for odd numbers
 * - Top N advance to knockout after Swiss rounds
 */

export interface SwissEntry {
  id: string
  participant_id: string
  seed: number | null
  status: string
}

export interface SwissMatch {
  division_id: string
  round: number
  sequence: number
  phase: 'swiss'
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  status: 'scheduled' | 'ready'
}

export interface SwissConfig {
  rounds: number
  qualifiers: number // Top N advance to knockout
}

interface StandingForPairing {
  entry_id: string
  wins: number
  points_for: number
  points_against: number
}

interface CompletedMatch {
  side_a_entry_id: string | null
  side_b_entry_id: string | null
}

/**
 * Generate Round 1 matches using seed-based pairing
 * Algorithm: Top half plays bottom half (1 vs n/2+1, 2 vs n/2+2, etc.)
 */
export function generateRound1Matches(
  divisionId: string,
  entries: SwissEntry[],
  config: SwissConfig
): SwissMatch[] {
  // Filter active entries only
  const activeEntries = entries.filter(e => e.status === 'active')

  // Sort by seed (nulls last)
  const sortedEntries = [...activeEntries].sort((a, b) => {
    if (a.seed === null) return 1
    if (b.seed === null) return -1
    return a.seed - b.seed
  })

  const n = sortedEntries.length
  const matches: SwissMatch[] = []

  // If odd number, lowest seed gets bye
  const hasbye = n % 2 === 1
  const pairCount = Math.floor(n / 2)

  // Top half vs bottom half pairing
  for (let i = 0; i < pairCount; i++) {
    matches.push({
      division_id: divisionId,
      round: 1,
      sequence: i + 1,
      phase: 'swiss',
      side_a_entry_id: sortedEntries[i].id,
      side_b_entry_id: sortedEntries[n - 1 - i].id,
      status: 'scheduled',
    })
  }

  // Handle bye if odd number
  if (hasbye) {
    const byeEntry = sortedEntries[pairCount]
    matches.push({
      division_id: divisionId,
      round: 1,
      sequence: pairCount + 1,
      phase: 'swiss',
      side_a_entry_id: byeEntry.id,
      side_b_entry_id: null, // null = bye
      status: 'scheduled',
    })
  }

  return matches
}

/**
 * Auto-assign seeds if not manually set
 * Uses participant_id order as tiebreaker
 */
export function autoAssignSeeds(entries: SwissEntry[]): SwissEntry[] {
  const unseeded = entries.filter(e => e.seed === null)
  const seeded = entries.filter(e => e.seed !== null)

  // Find next available seed
  const usedSeeds = new Set(seeded.map(e => e.seed))
  let nextSeed = 1

  return entries.map(entry => {
    if (entry.seed !== null) return entry

    // Find next unused seed
    while (usedSeeds.has(nextSeed)) {
      nextSeed++
    }

    const newEntry = { ...entry, seed: nextSeed }
    usedSeeds.add(nextSeed)
    nextSeed++

    return newEntry
  })
}

/**
 * Validate Swiss configuration
 */
export function validateSwissConfig(
  config: SwissConfig,
  entryCount: number
): { valid: boolean; error?: string } {
  if (config.rounds < 3) {
    return { valid: false, error: 'Swiss requires minimum 3 rounds' }
  }

  if (config.rounds > 10) {
    return { valid: false, error: 'Maximum 10 Swiss rounds allowed' }
  }

  if (config.qualifiers > entryCount) {
    return { valid: false, error: `Cannot have ${config.qualifiers} qualifiers with only ${entryCount} entries` }
  }

  if (config.qualifiers > 0 && config.qualifiers % 2 !== 0) {
    return { valid: false, error: 'Qualifiers must be even number for knockout bracket' }
  }

  if (config.qualifiers > 0) {
    const isPowerOf2 = (n: number) => n > 0 && (n & (n - 1)) === 0
    if (!isPowerOf2(config.qualifiers)) {
      return { valid: false, error: 'Qualifiers must be a power of 2 (2, 4, 8, 16, 32)' }
    }
  }

  return { valid: true }
}

/**
 * Calculate recommended number of Swiss rounds based on entry count
 */
export function recommendedSwissRounds(entryCount: number): number {
  if (entryCount <= 8) return 3
  if (entryCount <= 16) return 4
  if (entryCount <= 32) return 5
  if (entryCount <= 64) return 6
  return 7
}

/**
 * Build a set of previous pairings from completed matches.
 * Returns a Set of "entryA-entryB" keys (sorted so order doesn't matter).
 */
export function buildPairingHistory(matches: CompletedMatch[]): Set<string> {
  const history = new Set<string>()
  for (const match of matches) {
    if (match.side_a_entry_id && match.side_b_entry_id) {
      const pair = [match.side_a_entry_id, match.side_b_entry_id].sort()
      history.add(`${pair[0]}-${pair[1]}`)
    }
  }
  return history
}

function havePlayed(pairingHistory: Set<string>, a: string, b: string): boolean {
  const pair = [a, b].sort()
  return pairingHistory.has(`${pair[0]}-${pair[1]}`)
}

/**
 * Generate subsequent round matches (Round 2+) using score-based pairing.
 *
 * Algorithm:
 * 1. Group entries by win count (most wins first)
 * 2. Within each group, sort by point diff then points for
 * 3. Pair top-ranked vs bottom-ranked within each group
 * 4. Avoid rematches by swapping with adjacent pair
 * 5. Float odd players down to next group
 * 6. Assign bye to lowest-ranked player without a previous bye
 */
export function generateNextRoundMatches(
  divisionId: string,
  nextRound: number,
  standings: StandingForPairing[],
  pairingHistory: Set<string>,
  byeHistory: string[]
): SwissMatch[] {
  const matches: SwissMatch[] = []

  // Create a mutable list of entry IDs to pair, ordered by standings
  const entryIds = standings.map(s => s.entry_id)
  const standingsMap = new Map(standings.map(s => [s.entry_id, s]))

  // Handle bye for odd number of entries
  let byeEntryId: string | null = null
  if (entryIds.length % 2 === 1) {
    // Find lowest-ranked player who hasn't had a bye yet
    const byeHistorySet = new Set(byeHistory)
    for (let i = entryIds.length - 1; i >= 0; i--) {
      if (!byeHistorySet.has(entryIds[i])) {
        byeEntryId = entryIds[i]
        entryIds.splice(i, 1)
        break
      }
    }
    // If everyone has had a bye, give it to the lowest-ranked
    if (!byeEntryId) {
      byeEntryId = entryIds.pop()!
    }
  }

  // Group entries by win count
  const groups = new Map<number, string[]>()
  for (const entryId of entryIds) {
    const wins = standingsMap.get(entryId)?.wins ?? 0
    if (!groups.has(wins)) groups.set(wins, [])
    groups.get(wins)!.push(entryId)
  }

  // Sort groups by win count descending
  const sortedGroupKeys = [...groups.keys()].sort((a, b) => b - a)

  // Merge groups and handle float-downs for odd-sized groups
  // Then fold-pair within each group (top vs bottom half) to avoid top seeds meeting early
  const groupsInOrder: string[][] = []
  let floater: string | null = null

  for (const winCount of sortedGroupKeys) {
    const group = groups.get(winCount)!

    // Add floater from previous group if exists
    if (floater) {
      group.unshift(floater)
      floater = null
    }

    // If odd group, float the bottom player down
    if (group.length % 2 === 1) {
      floater = group.pop()!
    }

    if (group.length > 0) {
      groupsInOrder.push(group)
    }
  }

  // If there's still a floater, add as single-entry group
  if (floater) {
    // Try to append to last group if it exists
    if (groupsInOrder.length > 0) {
      groupsInOrder[groupsInOrder.length - 1].push(floater)
    } else {
      groupsInOrder.push([floater])
    }
  }

  // Fold-pair within each score group: #1 vs #(n/2+1), #2 vs #(n/2+2), etc.
  // This keeps top-ranked players apart within the same bracket.
  // If a fold pair is a rematch, swap with an adjacent pair to avoid it.
  let sequence = 1
  const paired = new Set<string>()

  for (const group of groupsInOrder) {
    const half = Math.floor(group.length / 2)
    const topHalf = group.slice(0, half)
    const bottomHalf = group.slice(half)

    for (let i = 0; i < topHalf.length; i++) {
      const entryA = topHalf[i]
      let entryB = bottomHalf[i]

      // If this would be a rematch, try swapping with adjacent bottom-half entries
      if (havePlayed(pairingHistory, entryA, entryB)) {
        let swapped = false
        for (let j = i + 1; j < bottomHalf.length; j++) {
          if (!paired.has(bottomHalf[j]) && !havePlayed(pairingHistory, entryA, bottomHalf[j])) {
            // Also check the displaced pairing won't be a rematch
            if (!havePlayed(pairingHistory, topHalf[j] || topHalf[i], bottomHalf[i])) {
              const temp = bottomHalf[i]
              bottomHalf[i] = bottomHalf[j]
              bottomHalf[j] = temp
              entryB = bottomHalf[i]
              swapped = true
              break
            }
          }
        }
        // If no swap found, allow the rematch (rare, late rounds)
      }

      paired.add(entryA)
      paired.add(entryB)

      matches.push({
        division_id: divisionId,
        round: nextRound,
        sequence,
        phase: 'swiss',
        side_a_entry_id: entryA,
        side_b_entry_id: entryB,
        status: 'scheduled',
      })
      sequence++
    }

  }

  // Add bye match
  if (byeEntryId) {
    matches.push({
      division_id: divisionId,
      round: nextRound,
      sequence,
      phase: 'swiss',
      side_a_entry_id: byeEntryId,
      side_b_entry_id: null,
      status: 'scheduled',
    })
  }

  return matches
}

/**
 * Check if all matches in a given round are completed
 */
export function isRoundComplete(
  matches: { round: number; status: string; phase: string }[],
  round: number
): boolean {
  const roundMatches = matches.filter(m => m.round === round && m.phase === 'swiss')
  if (roundMatches.length === 0) return false
  return roundMatches.every(m => m.status === 'completed' || m.status === 'walkover')
}

/**
 * Get the current (latest) Swiss round number from matches
 */
export function getCurrentRound(
  matches: { round: number; phase: string }[]
): number {
  const swissRounds = matches
    .filter(m => m.phase === 'swiss')
    .map(m => m.round)
  return swissRounds.length > 0 ? Math.max(...swissRounds) : 0
}

/**
 * Check if all Swiss rounds are complete
 */
export function isSwissPhaseComplete(
  matches: { round: number; status: string; phase: string }[],
  totalRounds: number
): boolean {
  const currentRound = getCurrentRound(matches)
  if (currentRound < totalRounds) return false
  return isRoundComplete(matches, totalRounds)
}
