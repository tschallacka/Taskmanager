import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { customerInvitations, customers, projects } from '../../../db/schema'
import { genId, requireProject } from '../../../utils/projects'
import { INVITATION_TTL_MS, newInvitationToken, requireCustomer, requireOrgStaff } from '../../../utils/customers'
import { customerChoiceError } from '#shared/utils/inviteEmail'

// The project's Share dialog path to a customer: the project is filed under the customer and an invitation to the
// email is made, in one step. The customer is picked from the team's list, or a new one is made under the team with
// the name typed. The caller must manage the customer.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = await readBody<{ customerId?: string, customerName?: string, email?: string }>(event)
  const customerId = (body?.customerId ?? '').trim()
  const customerName = (body?.customerName ?? '').trim()
  const email = (body?.email ?? '').trim()
  const problem = customerChoiceError({ customerId, customerName, email })
  if (problem) throw createError({ statusCode: 400, message: problem })
  if (!project.teamId) throw createError({ statusCode: 400, message: 'Only a team project can have a customer.' })

  let customer: { id: string, organizationId: string }
  if (customerId) {
    ;({ customer } = await requireCustomer(event, customerId, { manage: true }))
  } else {
    // A new customer is made under the project's team, by someone who manages the team's customers.
    const staff = await requireOrgStaff(event, { manage: true })
    if (staff.organizationId !== project.teamId) {
      throw createError({ statusCode: 400, message: 'Switch to this project\'s team first.' })
    }
    const now = Date.now()
    const [created] = await db.insert(customers).values({
      id: genId(),
      organizationId: project.teamId,
      name: customerName.slice(0, 120),
      createdAt: now,
      updatedAt: now
    }).returning()
    customer = created!
  }
  if (customer.organizationId !== project.teamId) {
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
