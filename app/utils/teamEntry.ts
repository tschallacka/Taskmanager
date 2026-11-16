// Which team the projects page opens for a person who has none selected (a new browser starts in the personal
// workspace). Only when the personal workspace is empty and they did not ask for a new project: otherwise it stays.

export interface TeamEntryInput {
  asksNew: boolean
  hasProjects: boolean
  activeTeamId: string | null
  teamIds: string[]
}

export function teamToOpenFor(input: TeamEntryInput): string | null {
  if (input.asksNew || input.hasProjects || input.activeTeamId) return null
  return input.teamIds[0] ?? null
}

/**
 * Selects the team. True when it worked (the caller reloads into it); false when it failed, in which case the person
 * stays in the personal workspace and nothing is thrown.
 */
export async function selectTeamOrStay(select: (teamId: string) => Promise<void>, teamId: string): Promise<boolean> {
  try {
    await select(teamId)
    return true
  } catch {
    return false
  }
}
