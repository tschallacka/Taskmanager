import { db } from '../../../db'
import { customerInvitations, customers, organization, projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { hashInvitationToken, INVITATION_COOKIE } from '../../../utils/customers'
import { auth } from '../../../lib/auth'
import { lookupAddressedInvitation } from '../../../utils/invitations'
import { addressesOfUser } from '../../../utils/extraEmails'
import { guestProjectIdsOf } from '../../../utils/guests'
import { sharedProjectIds } from '../../../utils/sharedProjectIds'
import { pendingBoardProjectIdsFor } from '../../../utils/pendingInvites'

// What an invitation link is for, readable before signing in: the invite page
// has to say whose portal, team or board it opens. Opening it also drops the token in a cookie,
// which is what lets an invited person create an account while sign-up is
// closed — including through an OAuth round trip, which loses the URL.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''

  const rememberToken = () => setCookie(event, INVITATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRequestProtocol(event) === 'https',
    path: '/',
    maxAge: 60 * 60 * 24
  })

  // A team or a board invites an address; a customer invites whoever opens the link.
  const addressed = await lookupAddressedInvitation(token)
  if (addressed !== 'missing') {
    if (addressed === 'used') throw createError({ statusCode: 410, message: 'This invitation has already been used' })
    if (addressed === 'expired') throw createError({ statusCode: 410, message: 'This invitation has expired' })
    rememberToken()
    // The address stays out of the answer: whoever holds the link has to know it, not read it here.
    // `forYou` only says whether the account signed in right now (if any) is the one invited.
    const session = await auth.api.getSession({ headers: event.headers }).catch(() => null)
    const forYou = session ? (await addressesOfUser(session.user.id)).includes(addressed.email) : null
    return addressed.kind === 'team'
      ? { kind: 'team' as const, organizationName: addressed.organizationName, inviterName: addressed.inviterName, role: addressed.role, forYou }
      : { kind: 'board' as const, projectName: addressed.projectName, organizationName: addressed.organizationName, inviterName: addressed.inviterName, role: addressed.role, forYou }
  }

  const [row] = await db
    .select({
      expiresAt: customerInvitations.expiresAt,
      acceptedAt: customerInvitations.acceptedAt,
      email: customerInvitations.email,
      customerId: customers.id,
      customerName: customers.name,
      organizationName: organization.name
    })
    .from(customerInvitations)
    .innerJoin(customers, eq(customers.id, customerInvitations.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(eq(customerInvitations.tokenHash, hashInvitationToken(token)))

  if (!row) throw createError({ statusCode: 404, message: 'This invitation does not exist' })
  if (row.acceptedAt) throw createError({ statusCode: 410, message: 'This invitation has already been used' })
  if (row.expiresAt <= Date.now()) throw createError({ statusCode: 410, message: 'This invitation has expired' })

  // How many projects are shared with this person as a customer contact: the customer's projects, and the boards
  // they hold as a guest when they are signed in. The page says before accepting that there are none yet.
  const customerShared = await db.select({ id: projects.id }).from(projects).where(eq(projects.customerId, row.customerId))
  const session = await auth.api.getSession({ headers: event.headers }).catch(() => null)
  const guestShared = session ? await guestProjectIdsOf(session.user.id) : []
  // Board invitations already sent to this account's address count too: accepting claims them (see utils/pendingInvites).
  const pendingIds = session ? await pendingBoardProjectIdsFor(await addressesOfUser(session.user.id), Date.now()) : []

  rememberToken()
  return {
    kind: 'customer' as const,
    customerName: row.customerName,
    organizationName: row.organizationName,
    // The address the link is tied to (approved by Boss: the token holder sees it in full). Null for an anonymous link.
    email: row.email,
    sharedProjectCount: sharedProjectIds(customerShared.map(project => project.id), [...guestShared, ...pendingIds]).length
  }
})
