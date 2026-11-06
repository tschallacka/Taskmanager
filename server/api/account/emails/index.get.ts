import { extraAddressesOf } from '../../../utils/extraEmails'

// The account's extra addresses, confirmed or still waiting for their link. Only the owner of the account
// gets this list.
export default defineEventHandler(async (event) => {
  const rows = await extraAddressesOf(event.context.session.user.id)
  return rows.map(row => ({ id: row.id, email: row.email, verified: row.verifiedAt !== null }))
})
