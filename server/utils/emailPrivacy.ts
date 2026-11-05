// Who may see an account's email address. The address belongs to its owner, who decides how far it
// travels, in five steps. The default is the narrowest: nobody else sees it.
//
//   owner     only the owner of the address
//   manager   + people who manage a board or a team the owner is on (team owners and admins, project managers)
//   team      + everyone in a team the owner is in
//   guests    + everyone who shares a board with the owner, a guest or a customer contact included
//   everyone  + every signed-in person
//
// Every list that shows other people's addresses goes through here, so one rule decides. An address a
// person typed themselves (the address on an invitation they sent) is not covered: they already know it.
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { member, user } from '../db/schema'

export const EMAIL_AUDIENCES = ['owner', 'manager', 'team', 'guests', 'everyone'] as const
export type EmailAudience = typeof EMAIL_AUDIENCES[number]

export function parseEmailAudience(value: unknown): EmailAudience | null {
  return typeof value === 'string' && (EMAIL_AUDIENCES as readonly string[]).includes(value) ? value as EmailAudience : null
}

/** What the viewer already knows about the board a list is scoped to, so a project's people need no per-person query. */
export interface EmailScope {
  /** Everyone in the list works on a board the viewer can open: they share a board. */
  sharesBoard?: boolean
  /** The viewer manages that board (owner, project manager, or team owner or admin). */
  managesBoard?: boolean
}

const isManagerRole = (role: string) => role.split(',').some(part => part.trim() === 'owner' || part.trim() === 'admin')

/** The ids among `targets` whose address the viewer may see. The viewer always sees their own. */
export async function emailsVisibleTo(
  viewerId: string,
  targets: { id: string, emailVisibility: string }[],
  scope: EmailScope = {}
): Promise<Set<string>> {
  const visible = new Set<string>()
  const undecided: { id: string, level: EmailAudience }[] = []
  for (const target of targets) {
    const level = parseEmailAudience(target.emailVisibility) ?? 'owner'
    if (target.id === viewerId || level === 'everyone') visible.add(target.id)
    else if (level !== 'owner') undecided.push({ id: target.id, level })
  }
  if (!undecided.length) return visible

  // What the viewer is in a team: the teams they belong to, and whether they run any of them.
  const viewerTeams = await db.select({ organizationId: member.organizationId, role: member.role }).from(member).where(eq(member.userId, viewerId))
  const managed = new Set(viewerTeams.filter(row => isManagerRole(row.role)).map(row => row.organizationId))
  const together = viewerTeams.length
    ? await db.select({ userId: member.userId, organizationId: member.organizationId }).from(member).where(and(
        inArray(member.userId, undecided.map(target => target.id)),
        inArray(member.organizationId, viewerTeams.map(row => row.organizationId))
      ))
    : []
  const teamOf = new Set(together.map(row => row.userId))
  const managerOf = new Set(together.filter(row => managed.has(row.organizationId)).map(row => row.userId))

  for (const target of undecided) {
    const isManager = managerOf.has(target.id) || Boolean(scope.managesBoard)
    const isTeam = teamOf.has(target.id)
    let allowed = false
    if (target.level === 'manager') allowed = isManager
    else if (target.level === 'team') allowed = isManager || isTeam
    else if (target.level === 'guests') {
      allowed = isManager || isTeam || Boolean(scope.sharesBoard)
      if (!allowed) {
        // Not in a team together and no board named: look for any board they share.
        const { sharedBoards } = await import('./personCard')
        allowed = (await sharedBoards(viewerId, target.id)).length > 0
      }
    }
    if (allowed) visible.add(target.id)
  }
  return visible
}

/**
 * The rows with each address kept or, when the viewer may not see it, set to null. Rows carry only an id and
 * an address; how far each address may travel is read here, in one query.
 */
export async function maskEmails<T extends { id: string, email: string }>(
  viewerId: string,
  rows: T[],
  scope: EmailScope = {}
): Promise<(Omit<T, 'email'> & { email: string | null })[]> {
  if (!rows.length) return []
  const levels = await db.select({ id: user.id, emailVisibility: user.emailVisibility }).from(user).where(inArray(user.id, [...new Set(rows.map(row => row.id))]))
  const visible = await emailsVisibleTo(viewerId, levels, scope)
  return rows.map(row => ({ ...row, email: visible.has(row.id) ? row.email : null }))
}

/** One account's address as the viewer may see it, or null. */
export async function emailFor(viewerId: string, target: { id: string, email: string }, scope: EmailScope = {}): Promise<string | null> {
  const [row] = await maskEmails(viewerId, [{ id: target.id, email: target.email }], scope)
  return row?.email ?? null
}

export async function emailAudienceOf(userId: string): Promise<EmailAudience> {
  const [row] = await db.select({ level: user.emailVisibility }).from(user).where(eq(user.id, userId))
  return parseEmailAudience(row?.level) ?? 'owner'
}

export async function setEmailAudience(userId: string, level: EmailAudience): Promise<void> {
  await db.update(user).set({ emailVisibility: level, updatedAt: new Date() }).where(eq(user.id, userId))
}

type MemberLike = { userId?: string, user?: { id?: string, email?: string | null } }

/**
 * A Better Auth answer that lists a team's members (full organisation, list members, set active) with each
 * address kept or nulled for this viewer. Anything else, and an answer with no member list, comes back as it
 * was. A request with no session sees no address at all.
 */
export async function scrubMemberEmails<T>(viewerId: string | null, body: T): Promise<T> {
  const members = (body as { members?: unknown } | null)?.members
  if (!Array.isArray(members)) return body
  const entries = members as MemberLike[]
  const rows = entries.flatMap((entry) => {
    const id = entry?.userId ?? entry?.user?.id
    return id && typeof entry.user?.email === 'string' ? [{ id, email: entry.user.email }] : []
  })
  if (!rows.length) return body
  const masked = viewerId ? await maskEmails(viewerId, rows) : rows.map(row => ({ ...row, email: null }))
  const shown = new Map(masked.map(row => [row.id, row.email]))
  const scrubbed = entries.map((entry) => {
    const id = entry?.userId ?? entry?.user?.id
    return id && entry.user && shown.has(id) ? { ...entry, user: { ...entry.user, email: shown.get(id) ?? null } } : entry
  })
  return { ...body, members: scrubbed }
}
