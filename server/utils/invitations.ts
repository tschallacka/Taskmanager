// The two kinds of invitation that are tied to an address, and the lookup that tells a link's kind
// before anyone has signed in. Customer invitations (a link for whoever opens it) live in customers.ts.
import type { H3Event } from 'h3'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db'
import { organization, projectGuestInvitations, projects, teamInvitations, user } from '../db/schema'
import { mailEnabled, sendMail } from '../lib/mailer'
import { hashInvitationToken } from './customers'
import { instanceNameOf } from './instanceBranding'

export type InvitationLookup
  = | { kind: 'team', id: string, email: string, role: string, organizationId: string, organizationName: string, inviterName: string | null }
    | { kind: 'board', id: string, email: string, role: 'editor' | 'manager', projectId: string, projectName: string, inviterName: string | null }

export type InvitationProblem = 'missing' | 'used' | 'expired'

/** What a team or board invitation link is for, or why it is not usable. Customer links are read elsewhere. */
export async function lookupAddressedInvitation(token: string): Promise<InvitationLookup | InvitationProblem> {
  const tokenHash = hashInvitationToken(token)
  const now = Date.now()

  const [team] = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      organizationId: teamInvitations.organizationId,
      organizationName: organization.name,
      inviterName: user.name,
      expiresAt: teamInvitations.expiresAt,
      acceptedAt: teamInvitations.acceptedAt,
      revokedAt: teamInvitations.revokedAt
    })
    .from(teamInvitations)
    .innerJoin(organization, eq(organization.id, teamInvitations.organizationId))
    .leftJoin(user, eq(user.id, teamInvitations.invitedBy))
    .where(eq(teamInvitations.tokenHash, tokenHash))
  if (team) {
    if (team.acceptedAt || team.revokedAt) return 'used'
    if (team.expiresAt <= now) return 'expired'
    return { kind: 'team', id: team.id, email: team.email, role: team.role, organizationId: team.organizationId, organizationName: team.organizationName, inviterName: team.inviterName }
  }

  const [board] = await db
    .select({
      id: projectGuestInvitations.id,
      email: projectGuestInvitations.email,
      role: projectGuestInvitations.role,
      status: projectGuestInvitations.status,
      projectId: projectGuestInvitations.projectId,
      projectName: projects.name,
      inviterName: user.name,
      expiresAt: projectGuestInvitations.expiresAt
    })
    .from(projectGuestInvitations)
    .innerJoin(projects, eq(projects.id, projectGuestInvitations.projectId))
    .leftJoin(user, eq(user.id, projectGuestInvitations.invitedBy))
    .where(eq(projectGuestInvitations.tokenHash, tokenHash))
  if (board) {
    if (board.status !== 'open') return 'used'
    if (board.expiresAt <= now) return 'expired'
    return { kind: 'board', id: board.id, email: board.email, role: board.role, projectId: board.projectId, projectName: board.projectName, inviterName: board.inviterName }
  }

  return 'missing'
}

/** Whether a token opens a team or board invitation that is still unspent, for the closed sign-up rule. */
export async function isLiveAddressedInvitation(token: string): Promise<boolean> {
  const tokenHash = hashInvitationToken(token)
  const now = Date.now()
  const [team] = await db.select({ id: teamInvitations.id }).from(teamInvitations).where(and(
    eq(teamInvitations.tokenHash, tokenHash),
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.revokedAt),
    gt(teamInvitations.expiresAt, now)
  ))
  if (team) return true
  const [board] = await db.select({ id: projectGuestInvitations.id }).from(projectGuestInvitations).where(and(
    eq(projectGuestInvitations.tokenHash, tokenHash),
    eq(projectGuestInvitations.status, 'open'),
    gt(projectGuestInvitations.expiresAt, now)
  ))
  return Boolean(board)
}

/**
 * Who may withdraw or replace an open team invitation: an owner, whatever the invitation, and an admin only
 * an invitation they sent themselves. An admin acts for themselves; the owner acts for the team.
 */
export function mayManageTeamInvitation(role: string, actorId: string, invitedBy: string | null): boolean {
  return role === 'owner' || (role === 'admin' && invitedBy === actorId)
}

/** The address of the app as an invitee reaches it. */
export function appOrigin(event: H3Event): string {
  return (process.env.BETTER_AUTH_URL || getRequestURL(event).origin).replace(/\/$/, '')
}

export function inviteUrl(event: H3Event, token: string): string {
  return `${appOrigin(event)}/invite/${token}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch]!)
}

/**
 * Mails an invitation link. Best effort: without SMTP nothing is sent and the inviter copies the link
 * from the answer instead; a failure to send is logged. Says whether a mail was handed over.
 */
export async function mailInvitation(input: { to: string, inviterName: string | null, what: string, url: string }): Promise<boolean> {
  if (!mailEnabled) return false
  const who = input.inviterName || 'Someone'
  const name = await instanceNameOf()
  const text = `${who} invited you to ${input.what} on ${name}.\n\nOpen the invitation: ${input.url}\n\nThe link works for ${input.to} only and expires in 14 days. If you were not expecting this, ignore this email.`
  const html = `<p>${escapeHtml(who)} invited you to ${escapeHtml(input.what)} on ${escapeHtml(name)}.</p>`
    + `<p><a href="${escapeHtml(input.url)}">Open the invitation</a></p>`
    + `<p style="color:#888;font-size:12px">The link works for ${escapeHtml(input.to)} only and expires in 14 days. If you were not expecting this, ignore this email.</p>`
  try {
    await sendMail({ to: input.to, subject: `${who} invited you to ${input.what}`, text, html })
    return true
  } catch (error) {
    console.error('[invitations] could not send the invitation mail', error)
    return false
  }
}
