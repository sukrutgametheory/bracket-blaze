/**
 * Centralized display name resolver for entries.
 * Handles both singles (participant) and doubles (team) entries.
 */
export function getEntryDisplayName(entry: {
  participant?: { display_name: string } | null
  team?: { name: string } | null
} | null): string {
  if (!entry) return "TBD"
  if (entry.participant?.display_name) return entry.participant.display_name
  if (entry.team?.name) return entry.team.name
  return "TBD"
}
