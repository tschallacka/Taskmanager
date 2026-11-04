// Who may bring guests onto a board, and what becomes of an invitation. A project admin invites anyone
// and sets each manager guest's domain. A manager guest invites at their own domain straight away and
// must ask a project admin for anyone else; a plain guest cannot invite. See projectGuests in the schema.
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { notifications, projectGuestInvitations, projectGuests, user } from '../db/schema'
import type { GuestRole } from '../db/schema'
import { INVITATION_TTL_MS, newInvitationToken } from './customers'
import { isInvalidDomain } from './crewAccounts'
import { accountByEmail, emailInDomain, guestRowOf, normalizeDomain, normalizeEmail, parseGuestRole } from './guests'
import { mailInvitation } from './invitations'
import { listProjectPeople, vaultRoleOf } from './projectMembers'
import { genId } from './projects'
import { publish, publishToUser, userTopic, workspaceTopic } from './realtime'

export interface ShareProject {
  id: string
  name: string
  userId: string
  teamId: string | null
  archivedAt?: number | null
}

export type ShareAuthority
  = | { kind: 'admin' }
    | { kind: 'guest-manager', allowedDomain: string | null }

/** What the caller may do about guests on this board, 403 when nothing. */
export async function requireShareAuthority(project: ShareProject, userId: string): Promise<ShareAuthority> {
  if (await vaultRoleOf(project, userId) === 'manager') return { kind: 'admin' }
  const row = await guestRowOf(project.id, userId)
  if (row?.role === 'manager') return { kind: 'guest-manager', allowedDomain: row.allowedDomain }
  throw createError({ statusCode: 403, message: 'Only a project admin or a manager guest can share this board' })
}

export async function requireProjectAdmin(project: ShareProject, userId: string) {
  const authority = await requireShareAuthority(project, userId)
  if (authority.kind !== 'admin') throw createError({ statusCode: 403, message: 'Only a project admin can do this' })
}

function requireWritable(project: ShareProject) {
  if (project.archivedAt) throw createError({ statusCode: 409, message: 'This board is archived. Unarchive it to change who can see it.' })
}

/** The people who run the board: team owners and admins, its owner and its project managers. */
export async function projectAdminIds(project: ShareProject): Promise<string[]> {
  return (await listProjectPeople(project)).filter(person => person.role === 'manager').map(person => person.id)
}

/** Tells people about a request or its outcome in their inbox. */
async function tell(input: {
  project: ShareProject
  recipients: string[]
  actorId: string | null
  type: 'guest_request' | 'guest_decision'
  invitationId: string
  title: string
  body: string
}) {
  const ids = [...new Set(input.recipients)].filter(id => id !== input.actorId)
  if (!ids.length) return
  const now = Date.now()
  await db.insert(notifications).values(ids.map(id => ({
    id: `${now.toString(36)}${Math.random().toString(36).slice(2)}`,
    userId: id,
    type: input.type,
    projectId: input.project.id,
    taskId: null,
    messageId: null,
    invitationId: input.invitationId,
    actorId: input.actorId,
    title: input.title,
    body: input.body,
    createdAt: now
  })))
  await Promise.all(ids.map(id => publishToUser(id, { type: 'notification' }).catch(() => {})))
}

async function nameOf(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId))
  return row?.name ?? null
}

async function announce(project: ShareProject) {
  await publish(workspaceTopic(project.userId, project.teamId), { type: 'board', projectId: project.id }).catch(() => {})
}

export interface InviteInput {
  email: unknown
  role: unknown
  /** For a manager guest: the domain they may invite at. Only a project admin sets it. */
  allowedDomain?: unknown
  /** From a manager guest: why this address, for the project admin who decides. */
  reason?: unknown
}

export interface InviteResult {
  id: string
  email: string
  role: GuestRole
  status: 'open' | 'awaiting_approval'
  /** The link, once, when the invitation is open. */
  url?: string
  emailed?: boolean
}

/**
 * Invites an address onto the board. Open straight away when the caller may; otherwise it waits for a
 * project admin, who is told in their inbox. Returns the link only for an open invitation.
 */
export async function inviteGuest(
  project: ShareProject,
  actorId: string,
  input: InviteInput,
  linkFor: (token: string) => string
): Promise<InviteResult> {
  const authority = await requireShareAuthority(project, actorId)
  requireWritable(project)

  const email = normalizeEmail(input.email)
  if (!email || isInvalidDomain(email)) throw createError({ statusCode: 400, message: 'Write a valid email address' })

  const role = parseGuestRole(input.role)
  if (role === 'manager' && authority.kind !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only a project admin can make someone a manager guest' })
  }

  let allowedDomain: string | null = null
  if (role === 'manager' && input.allowedDomain !== undefined && input.allowedDomain !== null && input.allowedDomain !== '') {
    allowedDomain = normalizeDomain(input.allowedDomain)
    if (!allowedDomain) throw createError({ statusCode: 400, message: 'Write the domain like superfabulousshop.com' })
  }

  // Someone who already has the access a guest would get is not invited again.
  const account = await accountByEmail(email)
  if (account) {
    const people = await listProjectPeople(project)
    if (people.some(person => person.id === account.id)) {
      throw createError({ statusCode: 409, message: 'That person is on the team and already sees this board' })
    }
    if (await guestRowOf(project.id, account.id)) {
      throw createError({ statusCode: 409, message: 'That person is already a guest of this board' })
    }
  }

  const waiting = await db.select({ id: projectGuestInvitations.id }).from(projectGuestInvitations).where(and(
    eq(projectGuestInvitations.projectId, project.id),
    eq(projectGuestInvitations.email, email),
    eq(projectGuestInvitations.status, 'awaiting_approval')
  ))
  if (waiting.length) throw createError({ statusCode: 409, message: 'A request for that address is already waiting for a project admin' })

  const needsApproval = authority.kind === 'guest-manager' && !emailInDomain(email, authority.allowedDomain)
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : ''
  if (needsApproval && reason.length < 3) {
    throw createError({ statusCode: 400, message: 'Say why this person should be invited, for the project admin' })
  }

  const now = Date.now()
  const id = genId()

  if (needsApproval) {
    await db.insert(projectGuestInvitations).values({
      id,
      projectId: project.id,
      email,
      role,
      allowedDomain: null,
      tokenHash: null,
      status: 'awaiting_approval',
      invitedBy: actorId,
      reason,
      createdAt: now,
      expiresAt: now + INVITATION_TTL_MS
    })
    const who = await nameOf(actorId)
    await tell({
      project,
      recipients: await projectAdminIds(project),
      actorId,
      type: 'guest_request',
      invitationId: id,
      title: `${who ?? 'A guest manager'} asks to invite ${email} to ${project.name}`,
      body: reason
    })
    await announce(project)
    return { id, email, role, status: 'awaiting_approval' }
  }

  // One live link per address: an earlier open invitation is withdrawn.
  await db.update(projectGuestInvitations).set({ status: 'revoked' }).where(and(
    eq(projectGuestInvitations.projectId, project.id),
    eq(projectGuestInvitations.email, email),
    eq(projectGuestInvitations.status, 'open')
  ))

  const { token, tokenHash } = newInvitationToken()
  await db.insert(projectGuestInvitations).values({
    id,
    projectId: project.id,
    email,
    role,
    allowedDomain,
    tokenHash,
    status: 'open',
    invitedBy: actorId,
    reason: reason || null,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS
  })
  const url = linkFor(token)
  const emailed = await mailInvitation({ to: email, inviterName: await nameOf(actorId), what: `see the board ${project.name}`, url })
  await announce(project)
  return { id, email, role, status: 'open', url, emailed }
}

async function waitingRequest(project: ShareProject, invitationId: string) {
  const [row] = await db.select().from(projectGuestInvitations).where(and(
    eq(projectGuestInvitations.id, invitationId),
    eq(projectGuestInvitations.projectId, project.id),
    eq(projectGuestInvitations.status, 'awaiting_approval')
  ))
  if (!row) throw createError({ statusCode: 404, message: 'That request is not waiting for a decision (any more)' })
  return row
}

/** A project admin lets a requested invitation through. It becomes an open invitation and its link is returned once. */
export async function approveRequest(
  project: ShareProject,
  adminId: string,
  invitationId: string,
  linkFor: (token: string) => string
) {
  await requireProjectAdmin(project, adminId)
  requireWritable(project)
  const row = await waitingRequest(project, invitationId)
  const now = Date.now()
  const { token, tokenHash } = newInvitationToken()
  const [claimed] = await db.update(projectGuestInvitations).set({
    status: 'open',
    tokenHash,
    decidedBy: adminId,
    decidedAt: now,
    expiresAt: now + INVITATION_TTL_MS
  }).where(and(eq(projectGuestInvitations.id, row.id), eq(projectGuestInvitations.status, 'awaiting_approval'))).returning({ id: projectGuestInvitations.id })
  if (!claimed) throw createError({ statusCode: 409, message: 'Someone else decided this request first' })

  const url = linkFor(token)
  const emailed = await mailInvitation({ to: row.email, inviterName: await nameOf(row.invitedBy), what: `see the board ${project.name}`, url })
  if (row.invitedBy) {
    await tell({
      project,
      recipients: [row.invitedBy],
      actorId: adminId,
      type: 'guest_decision',
      invitationId: row.id,
      title: `${row.email} was approved for ${project.name}`,
      body: emailed ? 'They got the invitation by email.' : 'Open the board\'s Share dialog to copy their link.'
    })
  }
  await announce(project)
  return { id: row.id, email: row.email, url, emailed }
}

/** A project admin turns a request down, with an optional word for the guest manager who asked. */
export async function declineRequest(project: ShareProject, adminId: string, invitationId: string, note: unknown) {
  await requireProjectAdmin(project, adminId)
  const row = await waitingRequest(project, invitationId)
  const [claimed] = await db.update(projectGuestInvitations).set({
    status: 'declined',
    decidedBy: adminId,
    decidedAt: Date.now()
  }).where(and(eq(projectGuestInvitations.id, row.id), eq(projectGuestInvitations.status, 'awaiting_approval'))).returning({ id: projectGuestInvitations.id })
  if (!claimed) throw createError({ statusCode: 409, message: 'Someone else decided this request first' })

  if (row.invitedBy) {
    await tell({
      project,
      recipients: [row.invitedBy],
      actorId: adminId,
      type: 'guest_decision',
      invitationId: row.id,
      title: `${row.email} was not approved for ${project.name}`,
      body: typeof note === 'string' ? note.trim().slice(0, 300) : ''
    })
  }
  await announce(project)
}

/** Withdraws an open invitation or a waiting request. An admin may withdraw any; a manager guest their own. */
export async function revokeInvitation(project: ShareProject, actorId: string, invitationId: string) {
  const authority = await requireShareAuthority(project, actorId)
  const [row] = await db.select().from(projectGuestInvitations).where(and(
    eq(projectGuestInvitations.id, invitationId),
    eq(projectGuestInvitations.projectId, project.id),
    inArray(projectGuestInvitations.status, ['open', 'awaiting_approval'])
  ))
  if (!row) throw createError({ statusCode: 404, message: 'No open invitation like that' })
  if (authority.kind !== 'admin' && row.invitedBy !== actorId) {
    throw createError({ statusCode: 403, message: 'You can only withdraw invitations you made' })
  }
  await db.update(projectGuestInvitations).set({ status: 'revoked' }).where(eq(projectGuestInvitations.id, row.id))
  await announce(project)
}

/** A project admin changes a guest's role, and a manager guest's domain. */
export async function changeGuest(
  project: ShareProject,
  adminId: string,
  guestUserId: string,
  patch: { role?: unknown, allowedDomain?: unknown }
) {
  await requireProjectAdmin(project, adminId)
  requireWritable(project)
  const row = await guestRowOf(project.id, guestUserId)
  if (!row) throw createError({ statusCode: 404, message: 'That person is not a guest of this board' })

  const role = patch.role === undefined ? row.role : parseGuestRole(patch.role)
  let allowedDomain = row.allowedDomain
  if (patch.allowedDomain !== undefined) {
    allowedDomain = patch.allowedDomain === null || patch.allowedDomain === '' ? null : normalizeDomain(patch.allowedDomain)
    if (patch.allowedDomain && !allowedDomain) throw createError({ statusCode: 400, message: 'Write the domain like superfabulousshop.com' })
  }
  await db.update(projectGuests).set({ role, allowedDomain: role === 'manager' ? allowedDomain : null }).where(eq(projectGuests.id, row.id))
  await announce(project)
}

/** A project admin takes a guest off the board. Their invitations and requests stay in the history. */
export async function removeGuest(project: ShareProject, adminId: string, guestUserId: string) {
  await requireProjectAdmin(project, adminId)
  const row = await guestRowOf(project.id, guestUserId)
  if (!row) throw createError({ statusCode: 404, message: 'That person is not a guest of this board' })
  await db.delete(projectGuests).where(eq(projectGuests.id, row.id))
  // What they could read is closed to them now; their open tabs are told to refetch.
  await publish(userTopic(guestUserId), { type: 'projects', projectId: project.id }).catch(() => {})
  await announce(project)
}

export interface GuestListing {
  /** What the caller may do: admins see everything, a manager guest only what they made. */
  me: { kind: 'admin' } | { kind: 'guest-manager', allowedDomain: string | null }
  guests: { userId: string, name: string, email: string, image: string | null, role: GuestRole, allowedDomain: string | null }[]
  invitations: { id: string, email: string, role: GuestRole, status: 'open' | 'awaiting_approval', reason: string | null, invitedBy: string | null, invitedByName: string | null, createdAt: number, expiresAt: number }[]
}

/** The guests, open invitations and waiting requests the caller may see on this board. */
export async function listGuests(project: ShareProject, actorId: string): Promise<GuestListing> {
  const me = await requireShareAuthority(project, actorId)

  const guests = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: projectGuests.role,
      allowedDomain: projectGuests.allowedDomain
    })
    .from(projectGuests)
    .innerJoin(user, eq(user.id, projectGuests.userId))
    .where(eq(projectGuests.projectId, project.id))
    .orderBy(asc(user.name))

  const invitations = await db
    .select({
      id: projectGuestInvitations.id,
      email: projectGuestInvitations.email,
      role: projectGuestInvitations.role,
      status: projectGuestInvitations.status,
      reason: projectGuestInvitations.reason,
      invitedBy: projectGuestInvitations.invitedBy,
      invitedByName: user.name,
      createdAt: projectGuestInvitations.createdAt,
      expiresAt: projectGuestInvitations.expiresAt
    })
    .from(projectGuestInvitations)
    .leftJoin(user, eq(user.id, projectGuestInvitations.invitedBy))
    .where(and(
      eq(projectGuestInvitations.projectId, project.id),
      inArray(projectGuestInvitations.status, ['open', 'awaiting_approval'])
    ))
    .orderBy(desc(projectGuestInvitations.createdAt))

  const now = Date.now()
  return {
    me,
    guests,
    invitations: invitations
      .filter(row => row.expiresAt > now)
      .filter(row => me.kind === 'admin' || row.invitedBy === actorId)
      .map(row => ({ ...row, status: row.status as 'open' | 'awaiting_approval' }))
  }
}
