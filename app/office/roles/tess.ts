// Tess Triage's piece of the route registry: she walks to her sorting table while there are findings to sort, stands by
// it, and shows the number of open findings as a badge. Her state is the count of findings nobody has triaged yet.
import { routes } from '../actor'
import type { P } from '../layout'

/** The tags that make a card a finding Tess has to sort: a reviewer's violation, or a bug in the Bugs column. */
export const FINDING_TAGS = ['ux violation', 'cq violation', 'qa violation', 'bug'] as const
/** Once a finding carries this tag, Tess has sorted it and it is out of her pile. */
export const TRIAGED_TAG = 'triaged'

/** Where Tess sorts the papers: the table by the corridor. Provisional until the screenshots. */
export const SORTING_TABLE: P = { x: -14.2, z: -6.8 }

/** Whether one card's tags are a finding still waiting for Tess. */
export function isOpenFinding(tags: readonly string[]): boolean {
  if (tags.includes(TRIAGED_TAG)) return false
  return FINDING_TAGS.some(tag => tags.includes(tag))
}

/** How many findings are waiting on the board. */
export function openFindings(cardTags: readonly (readonly string[])[]): number {
  return cardTags.filter(isOpenFinding).length
}

export interface TessData {
  /** The tags of every card on the board. */
  cardTags: readonly (readonly string[])[]
}

export interface TessState {
  open: number
}

routes.register<TessData, TessState>('tess', {
  stateOf: (data) => {
    const open = openFindings(data.cardTags)
    return open > 0 ? { open } : null
  },
  plan: state => ({ points: [SORTING_TABLE], then: 'stand', badge: state.open })
})
