// Guests on a board: who may invite whom, what a request to a project admin does, and what a guest
// can reach. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/guests.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, notifications, organization, projectColumns, projectGuestInvitations, projectGuests, projectTasks, projects, teamInvitations, user } = schema
const guests = await import('../server/utils/guests')
const invites = await import('../server/utils/guestInvites')
const { lookupAddressedInvitation, isLiveAddressedInvitation } = await import('../server/utils/invitations')
const { audienceFor, sessionProjectFilter, taskVisibilityFilter } = await import('../server/utils/auth-helpers')
const { projectPeople } = await import('../server/utils/people')
const { boardFilter } = await import('../server/utils/mcpAccess')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tgu-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const plain = id('plain')
const manager = id('manager')
const editor = id('editor')
const stranger = id('stranger')
const team = id('team')
const board = id('board')
const column = id('column')
const sharedTask = id('shared')
const privateTask = id('private')
const users = [owner, plain, manager, editor, stranger]

const project = () => ({ id: board, name: 'Guest board', userId: owner, teamId: team, customerId: null, archivedAt: null })
const link = (token: string) => `https://example.test/invite/${token}`
const tokenOf = (url?: string) => url!.split('/invite/')[1]!

async function refuses(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(promise, (e: { statusCode?: number, message?: string }) => {
    assert.equal(e.statusCode, status, e.message)
    if (pattern) assert.match(e.message ?? '', pattern)
    return true
  })
}

before(async () => {
  const at = new Date()
  await db.insert(user).values(users.map(u => ({ id: u, name: u, email: `${u}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values({ id: team, name: 'Guest team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: plain, role: 'member', createdAt: at }
  ])
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Guest board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values([
    { id: sharedTask, projectId: board, columnId: column, title: 'Shared', visibility: 'customer', position: 0, createdAt: now, updatedAt: now },
    { id: privateTask, projectId: board, columnId: column, title: 'Private', visibility: 'internal', position: 1000, createdAt: now, updatedAt: now }
  ])
  // The two guests as they stand once their invitations were accepted.
  await db.insert(projectGuests).values([
    { id: id('g1'), projectId: board, userId: manager, role: 'manager', allowedDomain: 'superfabulousshop.com', addedBy: owner, createdAt: now },
    { id: id('g2'), projectId: board, userId: editor, role: 'editor', allowedDomain: null, addedBy: owner, createdAt: now }
  ])
})

after(async () => {
  await db.delete(teamInvitations).where(eq(teamInvitations.organizationId, team))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('a domain and an address are normalised, and only the domain itself matches', () => {
  assert.equal(guests.normalizeDomain(' @SuperFabulousShop.com '), 'superfabulousshop.com')
  assert.equal(guests.normalizeDomain('not a domain'), null)
  assert.equal(guests.normalizeDomain('localhost'), null)
  assert.equal(guests.normalizeEmail(' People@SuperFabulousShop.com '), 'people@superfabulousshop.com')
  assert.equal(guests.normalizeEmail('a@b'), null)
  assert.equal(guests.normalizeEmail('a b@shop.com'), null)
  assert.equal(guests.emailInDomain('a@shop.com', 'shop.com'), true)
  assert.equal(guests.emailInDomain('a@mail.shop.com', 'shop.com'), false)
  assert.equal(guests.emailInDomain('a@notshop.com', 'shop.com'), false)
  assert.equal(guests.emailInDomain('a@shop.com', null), false)
})

test('a guest reaches the board from the personal workspace, as an outside reader', async () => {
  const reach = async (userId: string, teamId: string | null) => {
    const filter = sessionProjectFilter(userId, teamId, [], await guests.guestProjectIdsOf(userId))
    return (await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, board), filter))).length
  }
  assert.equal(await reach(manager, null), 1)
  assert.equal(await reach(editor, null), 1)
  assert.equal(await reach(stranger, null), 0)
  // Inside a team workspace a guest of another board sees only that team's boards.
  assert.equal(await reach(manager, id('other-team')), 0)

  assert.equal(audienceFor(manager, null, { userId: owner, teamId: team }), 'customer')
  assert.equal(audienceFor(owner, team, { userId: owner, teamId: team }), 'staff')

  // What an outside reader may read: the shared task, not the private one.
  const visible = await db.select({ id: projectTasks.id }).from(projectTasks)
    .where(and(eq(projectTasks.projectId, board), taskVisibilityFilter('customer')))
  assert.deepEqual(visible.map(row => row.id), [sharedTask])

  // An API key holds the same reach as its person.
  const key = { keyId: 'k', keyName: 'k', userId: manager, teamId: null, customerId: null, projectId: null, scopes: ['boards:read'] as ('boards:read')[] }
  assert.equal((await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, board), await boardFilter(key)))).length, 1)
})

test('the people of a board include its guests, who read like a customer contact', async () => {
  const people = await projectPeople(project())
  const byId = new Map(people.map(person => [person.id, person]))
  assert.equal(byId.get(owner)?.kind, 'staff')
  assert.equal(byId.get(manager)?.kind, 'customer')
  assert.equal(byId.get(manager)?.guestRole, 'manager')
  assert.equal(byId.get(editor)?.guestRole, 'editor')
  assert.equal(byId.has(stranger), false)
})

test('a project admin invites anyone; the link is returned once and is bound to the address', async () => {
  const answer = await invites.inviteGuest(project(), owner, { email: ' New.Person@Elsewhere.com ', role: 'editor' }, link)
  assert.equal(answer.status, 'open')
  assert.equal(answer.email, 'new.person@elsewhere.com')
  const found = await lookupAddressedInvitation(tokenOf(answer.url))
  if (typeof found === 'string' || found.kind !== 'board') return assert.fail('expected a board invitation')
  assert.equal(found.email, 'new.person@elsewhere.com')
  assert.equal(await isLiveAddressedInvitation(tokenOf(answer.url)), true)

  // Inviting the same address again withdraws the first link.
  const again = await invites.inviteGuest(project(), owner, { email: 'new.person@elsewhere.com', role: 'editor' }, link)
  assert.equal(await lookupAddressedInvitation(tokenOf(answer.url)), 'used')
  assert.equal(await isLiveAddressedInvitation(tokenOf(answer.url)), false)
  assert.equal(await isLiveAddressedInvitation(tokenOf(again.url)), true)
})

test('only a project admin or a manager guest may share; a plain guest and a plain member may not', async () => {
  await refuses(invites.inviteGuest(project(), editor, { email: 'x@y.com', role: 'editor' }, link), 403)
  await refuses(invites.inviteGuest(project(), plain, { email: 'x@y.com', role: 'editor' }, link), 403)
  await refuses(invites.inviteGuest(project(), stranger, { email: 'x@y.com', role: 'editor' }, link), 403)
  await refuses(invites.listGuests(project(), editor), 403)
})

test('a manager guest invites at their own domain straight away, and can never make a manager', async () => {
  const direct = await invites.inviteGuest(project(), manager, { email: 'colleague@superfabulousshop.com', role: 'editor' }, link)
  assert.equal(direct.status, 'open')
  assert.ok(direct.url)

  await refuses(invites.inviteGuest(project(), manager, { email: 'boss@superfabulousshop.com', role: 'manager' }, link), 403, /manager guest/)
  // The domain is exact: a subdomain is not the domain.
  const sub = await invites.inviteGuest(project(), manager, { email: 'a@mail.superfabulousshop.com', role: 'editor', reason: 'Our mail team' }, link)
  assert.equal(sub.status, 'awaiting_approval')
})

test('outside their domain a manager guest asks, with a reason, and a project admin decides from the inbox', async () => {
  await refuses(invites.inviteGuest(project(), manager, { email: 'agency@partner.com', role: 'editor' }, link), 400, /why/i)

  const asked = await invites.inviteGuest(project(), manager, { email: 'agency@partner.com', role: 'editor', reason: 'They build the checkout' }, link)
  assert.equal(asked.status, 'awaiting_approval')
  assert.equal(asked.url, undefined)
  // No link exists yet, so nothing can be accepted.
  const [row] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, asked.id))
  assert.equal(row!.tokenHash, null)

  // The project admins are told in their inbox, with the reason, and the request is theirs to decide.
  const told = await db.select().from(notifications).where(and(eq(notifications.userId, owner), eq(notifications.invitationId, asked.id)))
  assert.equal(told.length, 1)
  assert.equal(told[0]!.type, 'guest_request')
  assert.equal(told[0]!.body, 'They build the checkout')

  await refuses(invites.approveRequest(project(), manager, asked.id, link), 403)
  await refuses(invites.approveRequest(project(), plain, asked.id, link), 403)
  await refuses(invites.inviteGuest(project(), manager, { email: 'agency@partner.com', role: 'editor', reason: 'again' }, link), 409, /already waiting/)

  const approved = await invites.approveRequest(project(), owner, asked.id, link)
  assert.equal(approved.email, 'agency@partner.com')
  assert.equal(await isLiveAddressedInvitation(tokenOf(approved.url)), true)
  // The guest manager who asked hears the outcome.
  const outcome = await db.select().from(notifications).where(and(eq(notifications.userId, manager), eq(notifications.invitationId, asked.id)))
  assert.equal(outcome[0]!.type, 'guest_decision')
  // And a request that was decided cannot be decided again.
  await refuses(invites.approveRequest(project(), owner, asked.id, link), 404)
  await refuses(invites.declineRequest(project(), owner, asked.id, null), 404)
})

test('a declined request gives no link, and says so to the guest manager', async () => {
  const asked = await invites.inviteGuest(project(), manager, { email: 'nope@partner.org', role: 'editor', reason: 'Because' }, link)
  await invites.declineRequest(project(), owner, asked.id, 'Not this one')
  const [row] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, asked.id))
  assert.equal(row!.status, 'declined')
  assert.equal(row!.tokenHash, null)
  const outcome = await db.select().from(notifications).where(and(eq(notifications.userId, manager), eq(notifications.invitationId, asked.id)))
  assert.match(outcome[0]!.title, /not approved/)
  assert.equal(outcome[0]!.body, 'Not this one')
})

test('a manager guest sees and withdraws only their own invitations; a project admin sees all', async () => {
  const mine = await invites.listGuests(project(), manager)
  assert.equal(mine.me.kind, 'guest-manager')
  assert.ok(mine.invitations.length > 0)
  assert.ok(mine.invitations.every(invitation => invitation.invitedBy === manager))

  const all = await invites.listGuests(project(), owner)
  assert.equal(all.me.kind, 'admin')
  assert.ok(all.invitations.some(invitation => invitation.invitedBy === owner))

  const ownersInvitation = all.invitations.find(invitation => invitation.invitedBy === owner)!
  await refuses(invites.revokeInvitation(project(), manager, ownersInvitation.id), 403)
  await invites.revokeInvitation(project(), owner, ownersInvitation.id)
  const ownMine = mine.invitations[0]!
  await invites.revokeInvitation(project(), manager, ownMine.id)
})

test('a person who already sees the board is not invited again', async () => {
  await refuses(invites.inviteGuest(project(), owner, { email: `${plain}@staff.test`, role: 'editor' }, link), 409, /team/)
  await refuses(invites.inviteGuest(project(), owner, { email: `${editor}@staff.test`, role: 'editor' }, link), 409, /already a guest/)
  await refuses(invites.inviteGuest(project(), owner, { email: 'not an address', role: 'editor' }, link), 400)
  await refuses(invites.inviteGuest(project(), owner, { email: 'x@y.com', role: 'owner' }, link), 400)
  await refuses(invites.inviteGuest(project(), owner, { email: 'x@y.invalid', role: 'editor' }, link), 400)
})

test('a project admin sets a role and a domain, and takes a guest off the board', async () => {
  await refuses(invites.changeGuest(project(), manager, editor, { role: 'manager' }), 403)
  await invites.changeGuest(project(), owner, editor, { role: 'manager', allowedDomain: '@Other.com' })
  let [row] = await db.select().from(projectGuests).where(eq(projectGuests.userId, editor))
  assert.equal(row!.role, 'manager')
  assert.equal(row!.allowedDomain, 'other.com')

  await refuses(invites.changeGuest(project(), owner, editor, { allowedDomain: 'nonsense' }), 400)
  await invites.changeGuest(project(), owner, editor, { role: 'editor' })
  ;[row] = await db.select().from(projectGuests).where(eq(projectGuests.userId, editor))
  // An editor has no domain to keep.
  assert.equal(row!.allowedDomain, null)

  await refuses(invites.removeGuest(project(), manager, editor), 403)
  await invites.removeGuest(project(), owner, editor)
  assert.deepEqual(await guests.guestProjectIdsOf(editor), [])
  await refuses(invites.removeGuest(project(), owner, editor), 404)
})

test('"notify when tasks are added" tells a guest of what is not private, and never the author', async () => {
  const { isWatching, notifyWatchersOfTask, setWatching } = await import('../server/utils/projectWatchers')
  await setWatching(board, manager, true)
  await setWatching(board, owner, true)
  assert.equal(await isWatching(board, manager), true)

  await notifyWatchersOfTask({ id: board }, { id: sharedTask, title: 'Visible one', visibility: 'customer' }, owner)
  await notifyWatchersOfTask({ id: board }, { id: privateTask, title: 'Hidden one', visibility: 'internal' }, owner)
  const told = async (userId: string) =>
    (await db.select({ title: notifications.title }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, 'task_added')))).map(row => row.title)
  assert.deepEqual(await told(manager), [`${owner} added "Visible one" to Guest board`])
  assert.deepEqual(await told(owner), [])

  await setWatching(board, manager, false)
  assert.equal(await isWatching(board, manager), false)
})

test('a public mail provider can never be whitelisted as a manager guest\'s domain', async () => {
  await refuses(invites.inviteGuest(project(), owner, { email: 'a@company.test', role: 'manager', allowedDomain: 'gmail.com' }, link), 400, /public mail provider/)
  await refuses(invites.changeGuest(project(), owner, manager, { allowedDomain: '@Outlook.com' }), 400, /public mail provider/)
  assert.equal(guests.parseAllowedDomain(''), null)
  assert.equal(guests.parseAllowedDomain('Company.test'), 'company.test')
})

test('a team invitation is looked up by its link, and is spent or withdrawn for good', async () => {
  const { hashInvitationToken, newInvitationToken } = await import('../server/utils/customers')
  const { token, tokenHash } = newInvitationToken()
  await db.insert(teamInvitations).values({ id: id('ti'), organizationId: team, email: 'fresh@example.com', role: 'member', tokenHash, invitedBy: owner, createdAt: now, expiresAt: now + 60_000 })
  const found = await lookupAddressedInvitation(token)
  if (typeof found === 'string' || found.kind !== 'team') return assert.fail('expected a team invitation')
  assert.equal(found.organizationName, 'Guest team')
  assert.equal(await isLiveAddressedInvitation(token), true)

  await db.update(teamInvitations).set({ revokedAt: Date.now() }).where(eq(teamInvitations.tokenHash, hashInvitationToken(token)))
  assert.equal(await lookupAddressedInvitation(token), 'used')
  assert.equal(await isLiveAddressedInvitation(token), false)
  assert.equal(await lookupAddressedInvitation('no-such-token'), 'missing')
})
