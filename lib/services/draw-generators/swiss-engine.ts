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
 * Algorithm (matches pickleball-swiss-master reference):
 * 1. Sort all entries by standings (wins → point diff → points for)
 * 2. Assign bye to lowest-ranked player without a previous bye
 * 3. Group entries by win count (most wins first)
 * 4. Within each bracket, fold-pair: take top player, search from bottom
 *    for first non-rematch opponent. e.g. in a 16-player winners bracket,
 *    #1 faces #16, #2 faces #15, etc.
 * 5. If a bracket has an odd player left, float them down to the next bracket
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

  // Group entries by win count into brackets
  const brackets = new Map<number, string[]>()
  for (const entryId of entryIds) {
    const wins = standingsMap.get(entryId)?.wins ?? 0
    if (!brackets.has(wins)) brackets.set(wins, [])
    brackets.get(wins)!.push(entryId)
  }

  // Sort bracket keys by win count descending
  const sortedBracketKeys = [...brackets.keys()].sort((a, b) => b - a)

  // Build ordered list of mutable brackets (entries already in standings order within each)
  const orderedBrackets: string[][] = sortedBracketKeys.map(k => [...brackets.get(k)!])

  // Pair within each bracket using iterative top-from-bottom fold
  // If a bracket has an odd player left, float them to the next bracket
  let sequence = 1

  for (let bIdx = 0; bIdx < orderedBrackets.length; bIdx++) {
    const bracket = orderedBrackets[bIdx]

    while (bracket.length >= 2) {
      // Take the top-ranked player in this bracket
      const team1 = bracket.shift()!

      // Search from bottom of bracket for first non-rematch opponent
      let pairedTeam: string | null = null
      let pairedIndex = -1

      for (let j = bracket.length - 1; j >= 0; j--) {
        if (!havePlayed(pairingHistory, team1, bracket[j])) {
          pairedTeam = bracket[j]
          pairedIndex = j
          break
        }
      }

      // If no non-rematch found, allow rematch with the bottom player
      if (!pairedTeam) {
        pairedIndex = bracket.length - 1
        pairedTeam = bracket[pairedIndex]
      }

      // Remove paired opponent from bracket (by index)
      bracket.splice(pairedIndex, 1)

      matches.push({
        division_id: divisionId,
        round: nextRound,
        sequence,
        phase: 'swiss',
        side_a_entry_id: team1,
        side_b_entry_id: pairedTeam,
        status: 'scheduled',
      })
      sequence++
    }

    // If one player left in this bracket, float them down to the next bracket
    if (bracket.length === 1) {
      const floater = bracket[0]
      if (bIdx + 1 < orderedBrackets.length) {
        // Insert at the top of the next bracket (they're the strongest floater)
        orderedBrackets[bIdx + 1].unshift(floater)
      } else {
        // No next bracket — pair with last matched player as fallback
        // This shouldn't happen with proper bye handling, but be defensive
        const lastMatch = matches[matches.length - 1]
        if (lastMatch) {
          // Undo last match, re-pair as a 3-way float
          const undone = matches.pop()!
          sequence--
          const pool = [undone.side_a_entry_id!, undone.side_b_entry_id!, floater]
          // Pair first two, bye the third (lowest-ranked)
          matches.push({
            division_id: divisionId,
            round: nextRound,
            sequence,
            phase: 'swiss',
            side_a_entry_id: pool[0],
            side_b_entry_id: pool[1],
            status: 'scheduled',
          })
          sequence++
          // The third becomes an extra bye
          if (!byeEntryId) {
            byeEntryId = pool[2]
          }
        }
      }
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
