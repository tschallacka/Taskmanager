import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { customerInvitations, customers, projects } from '../../../db/schema'
import { genId } from '../../../utils/projects'
import { INVITATION_TTL_MS, newInvitationToken, requireCustomer } from '../../../utils/customers'
import { fileableProjectIds, inviteEmailError } from '#shared/utils/inviteEmail'
import { takenByOther, takenMessage } from '#shared/utils/projectFiling'

// Issues a single-use link that makes whoever opens it a contact of this
// customer, creating an account first if they have none. The token is shown in
// this response only; the database keeps its hash. An email, when given, ties the
// link to that address; the ticked projects of the team are filed under the customer.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { customer } = await requireCustomer(event, id, { manage: true })
  const body = await readBody<{ label?: string, email?: string, projectIds?: string[] }>(event)

  const email = (body?.email ?? '').trim()
  const emailProblem = inviteEmailError(email, false)
  if (emailProblem) throw createError({ statusCode: 400, message: emailProblem })

  // Only the team's own projects can be filed under the customer (see shared/utils/inviteEmail). A project already under
  // another customer is refused, not moved (see shared/utils/projectFiling): nothing is filed when one is taken.
  const teamProjects = await db
    .select({ id: projects.id, name: projects.name, customerId: projects.customerId, customerName: customers.name })
    .from(projects)
    .leftJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.teamId, customer.organizationId))
  const filedIds = new Set(fileableProjectIds(body?.projectIds ?? [], teamProjects.map(project => project.id)))
  const taken = takenByOther(customer.id, teamProjects.filter(project => filedIds.has(project.id)))
  if (taken.length) throw createError({ statusCode: 400, message: takenMessage(taken[0]!) })
  const filed = [...filedIds]

  const { token, tokenHash } = newInvitationToken()
  const now = Date.now()
  const [invitation] = await db.insert(customerInvitations).values({
    id: genId(),
    customerId: customer.id,
    tokenHash,
    label: body?.label?.trim().slice(0, 120) || null,
    email: email || null,
    createdBy: event.context.session.user.id,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS
  }).returning()

  // Filed after the invitation is written, so a failed invitation leaves the projects where they were.
  for (const projectId of filed) {
    await db.update(projects).set({ customerId: customer.id }).where(and(eq(projects.id, projectId), eq(projects.teamId, customer.organizationId)))
  }

  const origin = process.env.BETTER_AUTH_URL || getRequestURL(event).origin
  return {
    id: invitation!.id,
    label: invitation!.label,
    expiresAt: invitation!.expiresAt,
    url: `${origin.replace(/\/$/, '')}/invite/${token}`
  }
})
