import type { KnockoutVariant } from "@/types/database"

export const DEFAULT_KNOCKOUT_VARIANT: KnockoutVariant = "standard"
export const PRE_QUARTER_QUALIFIER_COUNT = 12

export function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

export function getKnockoutVariant(
  value: unknown,
  fallback: KnockoutVariant = DEFAULT_KNOCKOUT_VARIANT
): KnockoutVariant {
  return value === "pre_quarter_12" ? "pre_quarter_12" : fallback
}

export function isValidSwissKnockoutConfig(
  qualifierCount: number,
  variant: KnockoutVariant
): boolean {
  if (qualifierCount === 0) return variant === "standard"
  if (variant === "pre_quarter_12") return qualifierCount === PRE_QUARTER_QUALIFIER_COUNT
  return isPowerOf2(qualifierCount)
}

export function getKnockoutRoundCount(
  bracketSize: number | undefined,
  variant: KnockoutVariant
): number | null {
  if (!bracketSize || bracketSize <= 0) return null
  if (variant === "pre_quarter_12") return 4
  if (!isPowerOf2(bracketSize)) return null
  return Math.log2(bracketSize)
}

export function getKnockoutRoundLabel(
  round: number,
  totalRounds: number,
  variant: KnockoutVariant = DEFAULT_KNOCKOUT_VARIANT
): string {
  if (variant === "pre_quarter_12" && totalRounds === 4 && round === 1) {
    return "Pre Quarter"
  }

  const roundsFromEnd = totalRounds - round
  if (roundsFromEnd === 0) return "Final"
  if (roundsFromEnd === 1) return "Semi-Final"
  if (roundsFromEnd === 2) return "Quarter-Final"
  return `Round of ${Math.pow(2, roundsFromEnd + 1)}`
}

export function describeSwissKnockoutOption(
  qualifierCount: number,
  variant: KnockoutVariant = DEFAULT_KNOCKOUT_VARIANT
): string {
  if (qualifierCount === 0) return "Swiss only"
  if (variant === "pre_quarter_12") return "Top 12 (Pre Quarter)"
  return `Top ${qualifierCount} to knockout`
}
