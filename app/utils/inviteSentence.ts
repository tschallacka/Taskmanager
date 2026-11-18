// The words of the invite page. `Org` is the organisation's name; `project` is the project's name for a project
// invite. The email is shown only when no name is known, as a small line under the button.

const NAME_MAX = 40
const TITLE_MAX = 60

export interface InviteWordsInput {
  kind: 'team' | 'project'
  org: string
  project?: string
  name: string | null
  email: string
}

export interface InviteWords {
  headline: string
  sentence: string
  button: string
  footnote: string | null
}

/** A name or title cut to `max` characters, the last one an ellipsis. */
export function truncateName(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function inviteSentence(input: InviteWordsInput): InviteWords {
  const name = input.name?.trim() ? truncateName(input.name, NAME_MAX) : null
  const org = truncateName(input.org, TITLE_MAX)
  const footnote = name ? null : `Invitation for ${input.email}`
  const headline = name ? `Welcome, ${name}` : 'Welcome'

  if (input.kind === 'project') {
    const project = truncateName(input.project ?? '', TITLE_MAX)
    const sentence = name
      ? `${org} shares ${project} with you, ${name}: follow the progress and work together.`
      : `${org} shares ${project} with you: follow the progress and work together.`
    return { headline, sentence, button: `Join ${project}`, footnote }
  }

  const sentence = name
    ? `${org} invites you, ${name}, to join the team and work together.`
    : `${org} invites you to join the team and work together.`
  return { headline, sentence, button: `Join ${org}`, footnote }
}
