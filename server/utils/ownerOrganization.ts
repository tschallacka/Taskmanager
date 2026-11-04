// The instance's first account runs it: it is the instance admin, and it gets an
// organisation of its own to put customers and projects in. Both happen when that
// account is created, and once at startup for an instance that already had users
// before owner organisations existed.
import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, member, organization, user } from '../db/schema'
import { generateJoinCode } from './auth-helpers'
import { hashInvitationToken, INVITATION_COOKIE } from './customers'
import { isLiveAddressedInvitation } from './invitations'
import { genId } from './projects'

function slugFor(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)
  return base ? `${base}-${suffix}` : suffix
}

/** Gives a user an organisation they own, unless they already belong to one. */
export async function ensureOwnerOrganization(userId: string, userName: string) {
  const [existing] = await db.select({ id: member.id }).from(member).where(eq(member.userId, userId)).limit(1)
  if (existing) return

  const name = userName.trim() ? `${userName.trim()}'s organisation` : 'My organisation'
  const organizationId = genId()
  await db.insert(organization).values({
    id: organizationId,
    name,
    slug: slugFor(name),
    joinCode: generateJoinCode(),
    createdAt: new Date()
  })
  await db.insert(member).values({
    id: genId(),
    organizationId,
    userId,
    role: 'owner',
    createdAt: new Date()
  })
}

/** True when no account exists yet, so the one being created is the first. */
export async function isFirstUser(): Promise<boolean> {
  const [any] = await db.select({ id: user.id }).from(user).limit(1)
  return !any
}

/**
 * Promotes the oldest account on an instance that has users but no instance
 * admin — one that existed before this feature — and gives it its organisation.
 */
export async function backfillInstanceAdmin() {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.isInstanceAdmin, true)).limit(1)
  if (admin) return

  const [oldest] = await db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.createdAt)).limit(1)
  if (!oldest) return

  await db.update(user)
    .set({ isInstanceAdmin: true, canCreateOrganizations: true })
    .where(eq(user.id, oldest.id))
  await ensureOwnerOrganization(oldest.id, oldest.name)
}

/** Reads the invitation cookie out of a request's headers. */
export function invitationTokenFrom(headers: Headers | undefined): string | null {
  const cookie = headers?.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === INVITATION_COOKIE) return decodeURIComponent(value.join('='))
  }
  return null
}

/** Whether a token belongs to an invitation that is still open. */
export async function isLiveInvitation(token: string | null): Promise<boolean> {
  if (!token) return false
  const [row] = await db
    .select({ id: customerInvitations.id, acceptedAt: customerInvitations.acceptedAt })
    .from(customerInvitations)
    .where(and(
      eq(customerInvitations.tokenHash, hashInvitationToken(token)),
      gt(customerInvitations.expiresAt, Date.now())
    ))
  if (row && !row.acceptedAt) return true
  // A team or a board can invite an address too, and that person may create an account on a closed instance.
  return isLiveAddressedInvitation(token)
}
