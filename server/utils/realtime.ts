// Live updates. A workspace's data can change without the browser doing
// anything — an AI agent writing over MCP, a teammate on another machine, the
// same user in a second tab — so every mutation announces itself here and the
// WebSocket handler fans it out to the other clients in that workspace.
//
// Fan-out is in-process: peers live in this module's map, so a deployment
// running several app instances would need a shared bus (Redis, Postgres
// LISTEN/NOTIFY) between them. One instance, which is how Taskmanager ships, needs
// nothing else.
import type { Peer } from 'crossws'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { crewBoards, projects } from '../db/schema'
import { getUserActiveTeamId } from './auth-helpers'
import { hiddenCrewShadows } from './boardTree'

/**
 * What changed, at the coarsest useful grain — the client refetches the affected
 * slice rather than trying to apply a patch it was not part of.
 *
 * - `projects`: the set of boards changed (created, renamed, deleted)
 * - `board`: one board's columns, tasks or updates changed
 *
 * The optional id names the single board behind the change. Workspace clients
 * ignore it and refetch the slice; it exists so the change can also reach the
 * anonymous readers of that one shared link.
 */
export type RealtimeEvent
  = | { type: 'projects', projectId?: string }
    | { type: 'board', projectId: string }
    // A staff-only collection on a board changed: which one, so only the views
    // showing it refetch.
    | { type: 'resource', projectId: string, resource: ProjectResource }
    // Something arrived in the signed-in person's inbox.
    | { type: 'notification' }
    // A workspace-wide list that is not a board's own changed: goals or portfolios.
    | { type: 'collection', collection: WorkspaceCollection }

/** The collections hung off a project that are the team's own, named as their endpoints are. */
export type ProjectResource = 'messages' | 'status-updates' | 'time'

/** The workspace-wide lists that sit above the boards, named as their endpoints are. */
export type WorkspaceCollection = 'goals' | 'portfolios'

/** One person's own channel: every tab they have open listens on it. */
export function userTopic(userId: string): string {
  return `me:${userId}`
}

/**
 * Events are addressed to a workspace, never to a user: everyone looking at a
 * team's boards needs the same signal, and a personal workspace is just a
 * workspace of one.
 */
export function workspaceTopic(userId: string, teamId: string | null): string {
  return teamId ? `team:${teamId}` : `user:${userId}`
}

/**
 * A customer's contacts work from their own personal workspace, so they listen
 * on the customer's topic as well, one per customer they log in for.
 */
export function customerTopic(customerId: string): string {
  return `customer:${customerId}`
}

/** A board's guests work from their personal workspace, so they listen on each board they were let onto. */
export function guestTopic(projectId: string): string {
  return `guest:${projectId}`
}

/**
 * Topics for the public read-only pages. A shared link is its own audience:
 * the readers are anonymous and belong to no workspace, so they subscribe to
 * the one board they were given rather than to a workspace feed.
 */
export function publicProjectTopic(projectId: string): string {
  return `public:project:${projectId}`
}

/** The public topic a workspace event also belongs on, if it names one. */
function publicTopicFor(event: { projectId?: string }): string | null {
  return event.projectId ? publicProjectTopic(event.projectId) : null
}

interface Subscription {
  topics: string[]
  /** The tab that caused a change ignores its own echo. */
  clientId: string | null
  /** The signed-in person behind the socket; none for a shared link. */
  userId: string | null
}

const subscriptions = new Map<Peer, Subscription>()

export function subscribePeer(peer: Peer, topics: string | string[], clientId: string | null, userId: string | null = null) {
  subscriptions.set(peer, { topics: Array.isArray(topics) ? topics : [topics], clientId, userId })
}

export function unsubscribePeer(peer: Peer) {
  subscriptions.delete(peer)
}

export function peerCount(): number {
  return subscriptions.size
}

/**
 * Hangs up on everyone listening to a topic. Called when a share is switched
 * off or its subject is gone: the readers keep no data, but a socket that stays
 * subscribed would go on reporting that something changed on a board nobody
 * gave them access to any more.
 */
export function closeTopic(topic: string, code = 4404, reason = 'Not shared') {
  for (const [peer, subscription] of subscriptions) {
    if (!subscription.topics.includes(topic)) continue
    subscriptions.delete(peer)
    try {
      peer.close(code, reason)
    } catch {
      // Already gone; the map entry above was the only thing left to clean up.
    }
  }
}

/**
 * Sends once to every peer on any of the topics; a peer on two hears it once. With `viewers`, only the signed-in
 * people in that set hear it: a peer with no person behind it (a shared link) is left out.
 */
function fanout(topics: Set<string>, payload: string, originClientId?: string | null, viewers?: Set<string> | null) {
  for (const [peer, subscription] of subscriptions) {
    if (!subscription.topics.some(topic => topics.has(topic))) continue
    if (originClientId && subscription.clientId === originClientId) continue
    if (viewers && !(subscription.userId && viewers.has(subscription.userId))) continue
    try {
      peer.send(payload)
    } catch {
      // A peer that died between the change and the fan-out is dropped on close.
    }
  }
}

/**
 * Everyone who reads a board, wherever the change came from: its own workspace,
 * and the contacts of its customer. A contact's comment has to reach the team,
 * and the team's work has to reach the contact, though neither is the other's
 * workspace. A board that is gone has no audience left to tell.
 */
async function projectTopics(projectId: string): Promise<string[]> {
  const [project] = await db
    .select({ userId: projects.userId, teamId: projects.teamId, customerId: projects.customerId })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project) return []
  const topics = [workspaceTopic(project.userId, project.teamId), guestTopic(projectId)]
  if (project.customerId) topics.push(customerTopic(project.customerId))
  return topics
}

/** Whether the board is a crew's shadow board: only those can be hidden from a person. */
async function isCrewShadow(projectId: string): Promise<boolean> {
  const [link] = await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.shadowProjectId, projectId)).limit(1)
  return Boolean(link)
}

/** The signed-in people with a socket open who may see this shadow board, decided once per person. */
async function shadowViewers(projectId: string): Promise<Set<string>> {
  const listening = new Set<string>()
  for (const subscription of subscriptions.values()) {
    if (subscription.userId) listening.add(subscription.userId)
  }
  const viewers = new Set<string>()
  await Promise.all([...listening].map(async (userId) => {
    if (!(await hiddenCrewShadows(userId, [projectId])).has(projectId)) viewers.add(userId)
  }))
  return viewers
}

/**
 * Sends an event to every client in a workspace except the one that caused it,
 * to the readers of the board it names, and to anyone reading the shared link
 * of the board it names — a public page is a viewer of the same data, just
 * without a session. Readers of a shared link are never the origin of a
 * change, and a board that is not shared simply has no subscribers.
 *
 * The event only says that something changed. What each reader may see is
 * decided again when they refetch, so an internal change costs a contact a
 * refetch that comes back the same, and nothing more.
 */
export async function publish(topic: string, event: RealtimeEvent, originClientId?: string | null) {
  if (!subscriptions.size) return
  const topics = new Set([topic])

  // Only a board's own data reaches the people around it: a customer's
  // contacts, and whoever holds the shared link. A staff-only collection or a
  // personal notification goes to the one topic it was addressed to and nowhere
  // else, so a contact is not even told that the team has been talking.
  if (event.type === 'projects' || event.type === 'board') {
    if (event.projectId) {
      for (const extra of await projectTopics(event.projectId).catch(() => [])) topics.add(extra)
    }

    const publicTopic = publicTopicFor(event)
    if (publicTopic) topics.add(publicTopic)
  }

  // A hidden crew shadow's events reach only the people who may see that board (hiddenCrewShadows), whichever
  // topic they listen on: the workspace topic alone would tell every team member that a board they cannot open
  // changed. A failed lookup tells no one rather than everyone.
  const projectId = 'projectId' in event ? event.projectId : undefined
  const viewers = projectId && await isCrewShadow(projectId).catch(() => true)
    ? await shadowViewers(projectId).catch(() => new Set<string>())
    : null

  fanout(topics, JSON.stringify(event), originClientId, viewers)
}

/**
 * Announces a change made through an authenticated HTTP request. The workspace
 * comes from the session, and the browser's own tab id — sent as `x-client-id`
 * by the mutating composables — is excluded so a tab does not refetch what it
 * just wrote.
 */
export async function publishFromEvent(event: H3Event, realtimeEvent: RealtimeEvent) {
  const session = event.context.session
  if (!session) return
  const topic = workspaceTopic(session.user.id, await getUserActiveTeamId(event))
  await publish(topic, realtimeEvent, getRequestHeader(event, 'x-client-id') ?? null)
}

/**
 * Announces that a workspace's goals or portfolios changed. Staff-only: a
 * customer's contact has no goals, so it goes to the workspace topic alone.
 */
export async function publishCollection(event: H3Event, collection: WorkspaceCollection) {
  await publishFromEvent(event, { type: 'collection', collection })
}

/**
 * Tells one person something happened that is theirs alone, in every tab and
 * window they have open: a notification, which is addressed to them and to no
 * workspace.
 */
export async function publishToUser(userId: string, event: RealtimeEvent) {
  await publish(userTopic(userId), event)
}
