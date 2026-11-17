import { addressesOfUser } from '../../utils/extraEmails'
import { claimPendingBoardInvites, claimTiedCustomerInvites } from '../../utils/pendingInvites'

// The owner's rule: an invitation tied to the signed-in verified address is accepted by itself, with no second step.
// The projects page calls this once when it finds invitations waiting; the invitations not tied to the address stay on
// the pending-invitations page.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const addresses = await addressesOfUser(userId)
  const now = Date.now()
  await claimTiedCustomerInvites(userId, addresses, now)
  await claimPendingBoardInvites(userId, addresses, now)
  return { ok: true }
})
