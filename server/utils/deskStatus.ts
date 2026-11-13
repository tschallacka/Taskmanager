// Where the office's desk lights get each person's status. The crew monitor is the source that will fill it
// (its card comes after this one). Until it lands, the source gives nothing, so every light is grey and nobody
// is guessed busy or idle.
import type { OfficePerson, PersonStatus } from '../../shared/office/model'

export interface DeskStatusSource {
  /** The status of one cast member, or null when the source has none for them. */
  statusOf(person: OfficePerson): Promise<PersonStatus | null>
}

/** The source the office uses. Returns nothing until the crew monitor provides statuses. */
export const deskStatusSource: DeskStatusSource = {
  async statusOf() {
    return null
  }
}

/** The cast with each person's status set: the source's answer, or unknown when it has none. */
export async function withDeskStatus(cast: OfficePerson[], source: DeskStatusSource = deskStatusSource): Promise<OfficePerson[]> {
  return Promise.all(cast.map(async (person) => {
    const status = await source.statusOf(person)
    return { ...person, status: status ?? { state: 'unknown', note: '' } }
  }))
}
