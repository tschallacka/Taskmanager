import { db } from '../../../db'
import { customers } from '../../../db/schema'
import { genId, requireProject } from '../../../utils/projects'
import { requireCustomer, requireOrgStaff } from '../../../utils/customers'
import { fileAndInvite } from '../../../utils/projectCustomerInvite'
import { customerChoiceError } from '#shared/utils/inviteEmail'
import { takenMessage } from '#shared/utils/projectFiling'

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
  // A project already under another customer is refused, not moved (shared/utils/projectFiling).
  if (project.customerId && project.customerId !== customer.id) {
    const [current] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, project.customerId))
    throw createError({
      statusCode: 400,
      message: takenMessage({ id: project.id, name: project.name, customerId: project.customerId, customerName: current?.name ?? null })
    })
  }

  // The invitation is made first and the project filed after it, so a failed invitation leaves the project where it was.
  const made = await fileAndInvite({ projectId: project.id, customerId: customer.id, email, actorId: event.context.session.user.id, now: Date.now() })

  const origin = process.env.BETTER_AUTH_URL || getRequestURL(event).origin
  return {
    id: made.id,
    email,
    customerId: customer.id,
    expiresAt: made.expiresAt,
    url: `${origin.replace(/\/$/, '')}/invite/${made.token}`
  }
})
