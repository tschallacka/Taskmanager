import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { member, organization, user } from '../../db/schema'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { maskEmails } from '../../utils/emailPrivacy'
import { normalizeEmail } from '../../utils/guests'

// Every account on the instance, for the instance admin to hand out the right to own an organisation.
// The admin is no special reader of addresses: an address shows only to its owner, or when its owner allows
// the admin to see it. Accounts are told apart by name and by the organisations they belong to. Typing a
// complete address (?email=) finds that one account and shows the address the admin typed.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const viewerId = event.context.session.user.id
  const typed = normalizeEmail(getQuery(event).email)

  const accounts = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isInstanceAdmin: user.isInstanceAdmin,
      canCreateOrganizations: user.canCreateOrganizations
    })
    .from(user)
    .where(typed ? eq(user.email, typed) : undefined)
    .orderBy(asc(user.createdAt))

  const memberships = accounts.length
    ? await db
        .select({ userId: member.userId, id: organization.id, name: organization.name, role: member.role })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(inArray(member.userId, accounts.map(account => account.id)))
        .orderBy(asc(organization.name))
    : []
  const organisationsOf = (userId: string) => memberships
    .filter(row => row.userId === userId)
    .map(({ id, name, role }) => ({ id, name, role }))

  // A complete address the admin typed is theirs to see. Otherwise each address follows its owner's setting.
  const shown = typed ? accounts : await maskEmails(viewerId, accounts)
  return shown.map(account => ({ ...account, organisations: organisationsOf(account.id) }))
})
