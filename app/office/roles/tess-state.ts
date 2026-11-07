// Tess Triage's state, from the board: she sorts the papers at her table while there is a finding or a bug nobody
// has triaged yet. Pure: no renderer, no database, so it is tested on its own. The walk itself is in tess.ts.
import type { P } from '../layout'

/** The tags that make a card a finding Tess has to sort: a reviewer's violation, or a bug in the Bugs column. */
export const FINDING_TAGS = ['ux violation', 'cq violation', 'qa violation', 'bug'] as const
/** Once a finding carries this tag, Tess has sorted it and it is out of her pile. */
export const TRIAGED_TAG = 'triaged'

export type TessState = 'sort' | null

/** Whether one card's tags are a finding still waiting for Tess. */
export function isOpenFinding(tags: readonly string[]): boolean {
  if (tags.includes(TRIAGED_TAG)) return false
  return FINDING_TAGS.some(tag => tags.includes(tag))
}

/** Tess sorts while any open finding is on the board, and is off duty when the pile is empty. */
export function tessStateOf(cardTags: readonly (readonly string[])[]): TessState {
  return cardTags.some(isOpenFinding) ? 'sort' : null
}

/** Where Tess sorts the papers: the table by the corridor, on her side of the room. */
export const SORTING_TABLE: P = { x: -14.2, z: -6.8 }

/** A walk for one role: the points to walk through in order, then what the role does at the end. */
export interface RolePlan {
  points: P[]
  then: 'stand' | 'none'
}

/** Tess walks to the sorting table while she has papers to sort, then stands at it. */
export function tessPlan(state: TessState): RolePlan | null {
  return state ? { points: [SORTING_TABLE], then: 'stand' } : null
}
