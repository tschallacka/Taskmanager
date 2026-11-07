import { audited, crewBySlug, disableCrew, purgeCrew, requireCrewManager } from '../../utils/crewProvisioning'
import { detachCrewLinks } from '../../utils/crewBoards'

/**
 * Disables a crew: its keys are revoked and its sessions ended at once, and its
 * accounts cannot sign in. The team and board stay as history. A crew bound to a board
 * is taken off it too: the link goes and the shadow board is archived, its notes kept.
 * With ?purge=1 the accounts, team, customer and board are deleted. Disabling twice is harmless.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const purge = getQuery(event).purge === '1'
  return audited<{ slug: string, purged?: boolean, disabled?: boolean }>(caller, purge ? 'purge' : 'disable', slug, async () => {
    const crew = await crewBySlug(slug)
    await detachCrewLinks(crew.id)
    if (purge) {
      await purgeCrew(crew)
      return { result: { slug, purged: true }, summary: 'purged' }
    }
    await disableCrew(crew)
    return { result: { slug, disabled: true }, summary: 'disabled' }
  })
})
