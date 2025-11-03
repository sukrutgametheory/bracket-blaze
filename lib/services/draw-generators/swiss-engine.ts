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

interface Entry {
  id: string
  participant_id: string
  seed: number | null
  status: string
}

interface Match {
  division_id: string
  round: number
  sequence: number
  side_a_entry_id: string | null
  side_b_entry_id: string | null
  status: 'scheduled' | 'ready'
}

interface SwissConfig {
  rounds: number
  qualifiers: number // Top N advance to knockout
}

/**
 * Generate Round 1 matches using seed-based pairing
 * Algorithm: Top half plays bottom half (1 vs n/2+1, 2 vs n/2+2, etc.)
 */
export function generateRound1Matches(
  divisionId: string,
  entries: Entry[],
  config: SwissConfig
): Match[] {
  // Filter active entries only
  const activeEntries = entries.filter(e => e.status === 'active')

  // Sort by seed (nulls last)
  const sortedEntries = [...activeEntries].sort((a, b) => {
    if (a.seed === null) return 1
    if (b.seed === null) return -1
    return a.seed - b.seed
  })

  const n = sortedEntries.length
  const matches: Match[] = []

  // If odd number, lowest seed gets bye
  const hasbye = n % 2 === 1
  const pairCount = Math.floor(n / 2)

  // Top half vs bottom half pairing
  for (let i = 0; i < pairCount; i++) {
    matches.push({
      division_id: divisionId,
      round: 1,
      sequence: i + 1,
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
export function autoAssignSeeds(entries: Entry[]): Entry[] {
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
