// Who may ask for a crew's own token (issueCrewToken, card mwdd9d2vtgqhfr6izq): the instance admin is not in this file;
// the crew's creator and an owner or admin of the crew's team may; a plain member, an outsider and a crew's own account
// may not; an unknown board and a disabled crew answer not found. Needs the dev database with the crew tables pushed:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wade node --import tsx --test tests/crew-token-issue.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { allowCrews, clearCrewLevels } = await import('./helpers/crewLevels')
const { apiKeys, crewBoards, crews, customers, member, organization, projects, user } = schema
const { issueCrewToken } = await import('../server/utils/managementToken')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tct-${tag}-${name}`
const now = Date.now()

const creator = id('creator')
const admin = id('admin')
const plain = id('plain')
const outsider = id('outsider')
const crewAccount = id('crew-account')
const team = id('crew-team')
const customer = id('customer')
const crew = { ok: id('crew-ok'), disabled: id('crew-disabled') }
const board = { real: id('board-real'), shadow: id('board-shadow'), shadowOff: id('board-shadow-off') }

const rejects = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === status)

before(async () => {
  const at = new Date()
  await db.insert(user).values([creator, admin, plain, outsider, crewAccount].map(u => ({
    id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at
  })))
  await db.insert(organization).values({ id: team, name: 'Crew team', slug: team, createdAt: at })
  await db.insert(member).values([
    // The crew permission needs an owner or admin of the team (crewPermission), so the creator is an admin here.
    { id: id('m-creator'), organizationId: team, userId: creator, role: 'admin', createdAt: at },
    { id: id('m-admin'), organizationId: team, userId: admin, role: 'admin', createdAt: at },
    { id: id('m-plain'), organizationId: team, userId: plain, role: 'member', createdAt: at },
    { id: id('m-crew'), organizationId: team, userId: crewAccount, role: 'admin', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Crew product', createdAt: now, updatedAt: now })
  const crewRow = (cid: string, slug: string, disabledAt: number | null = null) =>
    ({ id: cid, slug: `${slug}-${tag}`, name: `Crew ${slug}`, teamId: team, customerId: customer, createdBy: creator, createdAt: now, disabledAt })
  await db.insert(crews).values([crewRow(crew.ok, 'ok'), crewRow(crew.disabled, 'disabled', now)])
  // The crew account is linked to its crew once the crew exists (user.crew_id references crews).
  await db.update(user).set({ crewId: crew.ok }).where(eq(user.id, crewAccount))
  const boardRow = (bid: string, extra: object = {}) =>
    ({ id: bid, userId: creator, teamId: team, name: bid.slice(-12), createdAt: now, updatedAt: now, ...extra })
  await db.insert(projects).values([boardRow(board.real), boardRow(board.shadow), boardRow(board.shadowOff)])
  await db.insert(crewBoards).values([
    { id: id('cb-ok'), crewId: crew.ok, projectId: board.real, shadowProjectId: board.shadow, createdBy: creator, createdAt: now },
    { id: id('cb-off'), crewId: crew.disabled, projectId: board.real, shadowProjectId: board.shadowOff, createdBy: creator, createdAt: now }
  ])
  await allowCrews(null, team, [board.real, board.shadow, board.shadowOff])
})

after(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.teamId, team))
  await db.delete(projects).where(inArray(projects.id, [board.real, board.shadow, board.shadowOff]))
  await db.delete(crews).where(inArray(crews.id, [crew.ok, crew.disabled]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [creator, admin, plain, outsider, crewAccount]))
  await clearCrewLevels()
  await db.$client.end()
})

test('the crew\'s creator may ask for the crew token, and the key is bound to that crew', async () => {
  const out = await issueCrewToken(creator, board.shadow)
  assert.ok(out.token.startsWith('arn_'), 'a token is returned once')
  const [row] = await db.select({ crewId: apiKeys.crewId, kind: apiKeys.kind }).from(apiKeys).where(eq(apiKeys.id, out.key.id))
  assert.equal(row?.crewId, crew.ok)
  assert.equal(row?.kind, 'management')
})

test('an owner or admin of the crew\'s team may ask for it', async () => {
  const out = await issueCrewToken(admin, board.shadow)
  assert.ok(out.token)
})

test('a plain member of the crew\'s team may not ask for it: 403', async () => {
  await rejects(issueCrewToken(plain, board.shadow), 403)
})

test('someone with no membership of the team may not ask for it: 403', async () => {
  await rejects(issueCrewToken(outsider, board.shadow), 403)
})

test('a crew\'s own account may not ask for a crew token, even as an admin of the team: 403', async () => {
  await rejects(issueCrewToken(crewAccount, board.shadow), 403)
})

test('an unknown board, and a board of a disabled crew, answer not found: 404', async () => {
  await rejects(issueCrewToken(creator, 'no-such-board'), 404)
  await rejects(issueCrewToken(creator, board.shadowOff), 404)
})

test('a board id that is missing is refused as a bad request: 400', async () => {
  await rejects(issueCrewToken(creator, ''), 400)
})
