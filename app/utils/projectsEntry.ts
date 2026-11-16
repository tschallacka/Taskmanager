// Where the projects page sends a person who has no board of their own. A customer contact or guest with no team goes
// to the shared list, never to the 'Your first project' form. Anyone else keeps the form.

export interface EntryInput {
  asksNew: boolean
  hasProjects: boolean
  teamCount: number
  contact: boolean
}

export function entryFor(input: EntryInput): string | null {
  if (input.asksNew || input.hasProjects || input.teamCount > 0) return null
  return input.contact ? '/shared-with-me' : null
}
