import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { customerInvitations, projects } from '../../../db/schema'
import { genId, requireProject } from '../../../utils/projects'
import { INVITATION_TTL_MS, newInvitationToken, requireCustomer } from '../../../utils/customers'
import { customerInviteInputError } from '#shared/utils/inviteEmail'

// The project's Share dialog path to a customer: the project is filed under the customer and an invitation to the
// email is made, in one step. The customer must belong to the project's team, and the caller must manage it.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = await readBody<{ customerId?: string, email?: string }>(event)
  const customerId = (body?.customerId ?? '').trim()
  const email = (body?.email ?? '').trim()
  const problem = customerInviteInputError({ customerId, email })
  if (problem) throw createError({ statusCode: 400, message: problem })

  const { customer } = await requireCustomer(event, customerId, { manage: true })
  if (!project.teamId || customer.organizationId !== project.teamId) {
    throw createError({ statusCode: 400, message: 'Choose a customer of this project\'s team.' })
  }

  await db.update(projects).set({ customerId: customer.id }).where(eq(projects.id, project.id))

  const { token, tokenHash } = newInvitationToken()
  const now = Date.now()
  const [invitation] = await db.insert(customerInvitations).values({
    id: genId(),
    customerId: customer.id,
    tokenHash,
    label: null,
    email,
    createdBy: event.context.session.user.id,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS
  }).returning()

  const origin = process.env.BETTER_AUTH_URL || getRequestURL(event).origin
  return {
    id: invitation!.id,
    email,
    customerId: customer.id,
    expiresAt: invitation!.expiresAt,
    url: `${origin.replace(/\/$/, '')}/invite/${token}`
  }
})
