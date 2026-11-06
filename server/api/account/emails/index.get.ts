import { mailEnabled } from '../../../lib/mailer'
import { extraAddressesOf } from '../../../utils/extraEmails'

// The account's extra addresses, confirmed or still waiting for their link, and whether this instance can
// send the link at all. Only the owner of the account gets this list. The panel hides the add form when mail is off.
export default defineEventHandler(async (event) => {
  const rows = await extraAddressesOf(event.context.session.user.id)
  return {
    mailEnabled,
    emails: rows.map(row => ({ id: row.id, email: row.email, verified: row.verifiedAt !== null }))
  }
})
