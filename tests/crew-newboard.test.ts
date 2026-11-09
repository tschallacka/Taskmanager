/* eslint-disable @typescript-eslint/no-explicit-any -- the answer is read loosely: each test checks the fields it names */
// The crew API's newBoard: a crew made with a board of its own in a team (the board owned by the caller, the
// team's default columns, the crew bound to it), the refusals that come before and after the board is made, the
// board removed again when the crew cannot be made, and the targets' canCreateBoard. Needs the test database and the
// Nuxt aliases the tool modules import:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-newboard.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, asc, eq, inArray, like } from 'drizzle-orm'

// Nitro provides these as globals; the crew code and the route file expect them. The route is called directly
// further down, with the bearer token and body handed in through a fake event.
Object.assign(globalThis, {
  createError,
  defineEventHandler: (handler: unknown) => handler,
  getRequestHeader: (event: { token?: string }, name: string) => (name === 'authorization' && event.token ? `Bearer ${event.token}` : undefined),
  readBody: async (event: { body?: unknown }) => event.body,
  setResponseStatus: (event: { status?: number }, status: number) => { event.status = status },
  setResponseHeader: () => undefined
})

const { db } = await import('../server/db')
const { agentAudit, apiKeys, crews, instanceSettings, member, organization, projectColumns, projects, rateLimitHits, user } = await import('../server/db/schema')
const { crewTargets, makeCrewOnNewBoard, parseNewBoard } = await import('../server/utils/crewBoards')
const { setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { purgeCrew } = await import('../server/utils/crewProvisioning')
const { DEFAULT_COLUMNS } = await import('../server/utils/teamSettings')
const { generateApiKey } = await import('../server/utils/api-keys')
const { default: crewsPost } = await import('../server/api/crews/index.post')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tnb-${tag}-${name}`
const now = Date.now()
const slug = `tnb-${tag}`
const takenSlug = `tnb-${tag}-taken`
const refusedSlug = `tnb-${tag}-no`
const plainSlug = `tnb-${tag}-plain`
const routeSlug = `tnb-${tag}-route`
const routePlainSlug = `tnb-${tag}-route-plain`

const boss = id('boss')
const plain = id('plain')
const outsider = id('outsider')
const admin = id('admin')
const realTeam = id('real-team')
const emptyTeam = id('empty-team')
const memberEmptyTeam = id('member-empty-team')
const routeTeam = id('route-team')
const otherTeam = id('other-team')
const board = { real: id('board-real'), foreign: id('board-foreign') }
const names = { made: 'Fresh board', refused: 'Refused board', plain: 'Plain board' }

const caller = (userId: string) => ({ userId, keyId: null, keyName: 'test key' })
const management = (userId: string, boardId: string) => ({ userId, keyId: id('mgmt'), keyName: 'management', boardId })
const product = { name: 'New board product' }
// h3's createError carries the sentence in `message` on some versions and `statusMessage` on others.
const msgOf = (e: { statusMessage?: string, message?: string }) => e.statusMessage ?? e.message
const rejects = (promise: Promise<unknown>, status: number, message?: string) =>
  assert.rejects(promise, (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === status && (message === undefined || msgOf(e) === message))

let made: { made: { status: number, body: any }, boardId: string } | null = null
let beforeTargets: { team_id: string, team_name: string, userboards: { board_id: string }[] }[] = []

before(async () => {
  const at = new Date()
  await db.insert(user).values([boss, plain, outsider, admin].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.update(user).set({ isInstanceAdmin: true }).where(eq(user.id, admin))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: emptyTeam, name: 'Empty team', slug: emptyTeam, createdAt: at },
    { id: memberEmptyTeam, name: 'Member team', slug: memberEmptyTeam, createdAt: at },
    { id: routeTeam, name: 'Route team', slug: routeTeam, createdAt: at },
    { id: otherTeam, name: 'Other team', slug: otherTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m3'), organizationId: emptyTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m4'), organizationId: otherTeam, userId: outsider, role: 'owner', createdAt: at },
    { id: id('m5'), organizationId: memberEmptyTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m6'), organizationId: routeTeam, userId: admin, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.real, userId: boss, teamId: realTeam, name: 'Office board', createdAt: now, updatedAt: now },
    { id: board.foreign, userId: outsider, teamId: otherTeam, name: 'Foreign board', createdAt: now, updatedAt: now }
  ])
  // The targets as they are before any new board is made: the existing entries must come back unchanged.
  beforeTargets = (await crewTargets(boss)).teams
})

// The instance and team levels of the crew permission on, for the team these tests make boards in.
async function enableLevels() {
  await setInstanceCrews(true, null)
  await setTeamCrews(realTeam, true)
}

after(async () => {
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
  const made = await db.select().from(crews).where(inArray(crews.slug, [slug, takenSlug, refusedSlug, plainSlug, routeSlug, routePlainSlug]))
  for (const crew of made) await purgeCrew(crew)
  await db.delete(apiKeys).where(like(apiKeys.id, `tnb-${tag}-%`))
  await db.delete(rateLimitHits).where(like(rateLimitHits.scope, `crews|user:tnb-${tag}-%`))
  await db.delete(organization).where(inArray(organization.id, [`crew-${takenSlug}`]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, emptyTeam, memberEmptyTeam, routeTeam, otherTeam]))
  await db.delete(user).where(inArray(user.id, [boss, plain, outsider, admin]))
  await db.$client.end()
})

test('a crew with newBoard gets a new board in the team, owned by the caller, with the default columns, bound to it', async () => {
  await enableLevels()
  made = await makeCrewOnNewBoard({ slug, name: 'New crew', product, rotate: false }, caller(boss), { teamId: realTeam, name: names.made })
  assert.equal(made.made.status, 201)
  const body = made.made.body
  assert.equal(body.real_board.board_id, made.boardId)
  assert.equal(body.real_board.board_name, names.made)
  assert.equal(body.userboard.board_id, made.boardId)
  assert.equal(body.shadow_board.board_id, body.userboard.shadowboards[0].board_id)
  assert.match(body.real_board.url, new RegExp(`/projects/${made.boardId}$`))

  const [row] = await db.select().from(projects).where(eq(projects.id, made.boardId))
  assert.equal(row!.teamId, realTeam, 'the board is in the team it was asked for')
  assert.equal(row!.userId, boss, 'the caller owns it, as a board made in the UI')
  assert.equal(row!.crewsAllowed, true, 'the board takes a crew')
  const columns = await db.select({ name: projectColumns.name }).from(projectColumns)
    .where(eq(projectColumns.projectId, made.boardId)).orderBy(asc(projectColumns.position))
  assert.deepEqual(columns.map(c => c.name), [...DEFAULT_COLUMNS], 'the default columns a new board gets')

  const [shadow] = await db.select().from(projects).where(eq(projects.id, body.shadow_board.board_id))
  assert.equal(shadow!.teamId, body.team.id, 'the shadow board is in the crew team')
  assert.equal(body.people.wren.apiKey.startsWith('arn_'), true, 'the crew people and keys are answered as before')
})

test('the newBoard shape and name are checked before anything is made', () => {
  assert.equal(parseNewBoard({ slug: 'x' }, caller(boss)), null, 'no newBoard, no change')
  assert.throws(() => parseNewBoard({ newBoard: { name: 'A' }, projectId: board.real, teamId: realTeam }, caller(boss)),
    (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 400 && msgOf(e) === 'Send projectId or newBoard, not both.')
  assert.throws(() => parseNewBoard({ newBoard: { name: 'A' } }, caller(boss)),
    (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 400 && msgOf(e) === 'newBoard needs a teamId.')
  assert.throws(() => parseNewBoard({ newBoard: { name: '   ' }, teamId: realTeam }, caller(boss)),
    (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 400 && msgOf(e) === 'newBoard.name must be text of 1 to 120 characters.')
  assert.throws(() => parseNewBoard({ newBoard: { name: 'a'.repeat(121) }, teamId: realTeam }, caller(boss)),
    (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 400 && msgOf(e) === 'newBoard.name must be text of 1 to 120 characters.')
  assert.throws(() => parseNewBoard({ newBoard: {}, teamId: realTeam }, caller(boss)), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.deepEqual(parseNewBoard({ newBoard: { name: '  Sprint  ' }, teamId: realTeam }, caller(boss)), { teamId: realTeam, name: 'Sprint' })
  assert.deepEqual(parseNewBoard({ newBoard: { name: 'a'.repeat(120) }, teamId: realTeam }, caller(boss))?.name.length, 120)
  assert.throws(() => parseNewBoard({ newBoard: { name: 'Sprint' }, teamId: realTeam }, management(boss, board.real)),
    (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 403 && msgOf(e) === 'A management token cannot create a new board.')
})

test('a key of another team, and a rotate of the crew already made, are refused', async () => {
  await rejects(makeCrewOnNewBoard({ slug: refusedSlug, name: 'Refused', product, rotate: false }, caller(outsider), { teamId: realTeam, name: names.refused }), 403, 'Your key may not create boards in that team.')
  await rejects(makeCrewOnNewBoard({ slug, name: 'New crew', product, rotate: true }, caller(boss), { teamId: realTeam, name: names.refused }), 400, 'A crew that already exists keeps its board; use projectId or no board.')
  await rejects(makeCrewOnNewBoard({ slug, name: 'New crew', product, rotate: false }, caller(boss), { teamId: realTeam, name: names.refused }), 409)
  const refusedBoards = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.teamId, realTeam), eq(projects.name, names.refused)))
  assert.deepEqual(refusedBoards, [], 'a refused call leaves no board behind')
  assert.deepEqual(await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, refusedSlug)), [])
})

test('a plain member of the team is refused the crew, and the board they tried to make is removed again', async () => {
  // The member passes the UI's board-creation check; binding the crew to the board then needs owner or admin of the team.
  await rejects(makeCrewOnNewBoard({ slug: plainSlug, name: 'Plain crew', product, rotate: false }, caller(plain), { teamId: realTeam, name: names.plain }), 403)
  const leftover = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.teamId, realTeam), eq(projects.name, names.plain)))
  assert.deepEqual(leftover, [], 'a refused call leaves no board behind')
  assert.deepEqual(await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, plainSlug)), [])
})

test('a crew that cannot be made leaves no board behind', async () => {
  // A team already holds the name the crew's own team would take: the crew is refused after its board is made.
  await db.insert(organization).values({ id: `crew-${takenSlug}`, name: 'Taken', slug: `crew-${takenSlug}`, createdAt: new Date() })
  await rejects(makeCrewOnNewBoard({ slug: takenSlug, name: 'Taken', product, rotate: false }, caller(boss), { teamId: realTeam, name: names.refused }), 409, `A team named crew-${takenSlug} already exists.`)
  const left = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.teamId, realTeam), eq(projects.name, names.refused)))
  assert.deepEqual(left, [], 'the board made for the attempt is gone')
  assert.deepEqual(await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, takenSlug)), [])
})

test('the crew permission still applies: a team that does not allow crews refuses the new board', async () => {
  await setTeamCrews(realTeam, false)
  await rejects(makeCrewOnNewBoard({ slug: refusedSlug, name: 'Refused', product, rotate: false }, caller(boss), { teamId: realTeam, name: names.refused }), 403)
  await setTeamCrews(realTeam, true)
  const left = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.teamId, realTeam), eq(projects.name, names.refused)))
  assert.deepEqual(left, [])
})

test('targets list a team with no boards with canCreateBoard, and a management token never may', async () => {
  const bossTargets = (await crewTargets(boss)).teams
  const empty = bossTargets.find(t => t.team_id === emptyTeam)
  assert.ok(empty, 'the owner sees a team with no boards')
  assert.deepEqual(empty.userboards, [])
  assert.equal(empty.canCreateBoard, true)
  const withBoards = bossTargets.find(t => t.team_id === realTeam)!
  assert.equal(withBoards.canCreateBoard, true)
  assert.ok(withBoards.userboards.some(b => b.board_id === made!.boardId), 'the board made with newBoard is listed')

  const token = (await crewTargets(boss, board.real)).teams
  assert.deepEqual(token.map(t => t.team_id), [realTeam], 'a token sees only its own team')
  assert.equal(token[0]!.canCreateBoard, false)
  assert.deepEqual(token[0]!.userboards.map(b => b.board_id), [board.real], 'and only its own board')
})

test('targets: the existing entries are unchanged, and a plain member sees only a team with no boards', async () => {
  // The entries as they were before any new board: team, name and boards, in the same order (the new board aside).
  const shape = (teams: { team_id: string, team_name: string, userboards: { board_id: string }[] }[], without?: string) =>
    teams.map(team => ({ team_id: team.team_id, team_name: team.team_name, userboards: team.userboards.map(b => b.board_id).filter(b => b !== without) }))
  const before = shape(beforeTargets)
  const current = shape((await crewTargets(boss)).teams, made!.boardId).filter(team => before.some(b => b.team_id === team.team_id))
  assert.deepEqual(current, before, 'the teams the owner had are listed as before')

  const plainTeams = (await crewTargets(plain)).teams
  assert.deepEqual(plainTeams.map(t => t.team_id), [memberEmptyTeam], 'a plain member sees only the team with no boards, not the team with boards')
  assert.deepEqual(plainTeams[0], { team_id: memberEmptyTeam, team_name: 'Member team', canCreateBoard: true, userboards: [] })
})

test('the route: an instance admin makes a board and a crew in one call; the audit row names the board; the call is charged', async () => {
  const token = await keyFor(admin, null, 'admin-route')
  const reply = await postCrew(token, { slug: routeSlug, name: 'Route crew', product, teamId: routeTeam, newBoard: { name: 'Route board' } })
  assert.equal(reply.status, 201)
  const boardId = reply.body.real_board.board_id
  assert.equal(reply.body.real_board.board_name, 'Route board')
  const [row] = await db.select().from(projects).where(eq(projects.id, boardId))
  assert.equal(row!.teamId, routeTeam)
  const audit = await db.select().from(agentAudit).where(and(eq(agentAudit.userId, admin), eq(agentAudit.tool, 'crew_create'), eq(agentAudit.projectId, boardId)))
  assert.equal(audit.length, 1, 'one audit row for the call, carrying the new board id')
  assert.equal(audit[0]!.summary, `created (new board) (${routeSlug})`)
  // A newBoard call is charged for the instance admin too (the card's decision): one use in each crews window.
  const charged = await db.select().from(rateLimitHits).where(like(rateLimitHits.scope, `crews|user:${admin}%`))
  assert.ok(charged.length >= 1, 'the newBoard call is charged against the crews limit')
  assert.ok(charged.every(hit => hit.hits === 1), 'one use counted per window')
})

test('the route: a key bound to a board, or with no board, cannot make one, and nothing is charged', async () => {
  const bound = await keyFor(boss, board.real, 'bound')
  assert.equal((await postCrew(bound, { slug: routePlainSlug, name: 'Bound crew', product, teamId: realTeam, newBoard: { name: 'Bound board' } })).status, 403)
  const unbound = await keyFor(plain, null, 'unbound')
  assert.equal((await postCrew(unbound, { slug: routePlainSlug, name: 'Unbound crew', product, teamId: memberEmptyTeam, newBoard: { name: 'Unbound board' } })).status, 403)
  assert.deepEqual(await db.select({ id: projects.id }).from(projects).where(eq(projects.name, 'Bound board')), [])
  assert.deepEqual(await db.select({ id: projects.id }).from(projects).where(eq(projects.name, 'Unbound board')), [])
  assert.deepEqual(await db.select().from(rateLimitHits).where(like(rateLimitHits.scope, `crews|user:${boss}%`)), [],
    'a refusal before the board is made is not charged')
})

test('the route: a crew call without newBoard answers as before, with no board and no project in its audit row', async () => {
  const token = await keyFor(admin, null, 'admin-plain')
  const reply = await postCrew(token, { slug: routePlainSlug, name: 'Plain route crew', product })
  assert.equal(reply.status, 201)
  assert.equal(reply.body.real_board, undefined)
  assert.equal(reply.body.userboard, undefined)
  assert.equal(reply.body.shadow_board, undefined)
  // The answer's fields for a call without newBoard: the same set the route answered before this change, with no board fields added.
  assert.deepEqual(Object.keys(reply.body).sort(), ['base', 'board', 'crew', 'keys_note', 'keys_url', 'people', 'team'])
  const audit = await db.select().from(agentAudit).where(and(eq(agentAudit.userId, admin), eq(agentAudit.tool, 'crew_create'), eq(agentAudit.summary, `created (${routePlainSlug})`)))
  assert.equal(audit.length, 1)
  assert.equal(audit[0]!.projectId, null, 'no board in the audit row, as before')
})

/** A key of `userId`, pinned to `projectId` when given, that may manage crews. */
async function keyFor(userId: string, projectId: string | null, name: string): Promise<string> {
  const generated = generateApiKey()
  await db.insert(apiKeys).values({
    id: id(`key-${name}`),
    userId,
    teamId: null,
    projectId,
    name: `newboard ${name}`,
    keyHash: generated.hash,
    keyPrefix: generated.displayPrefix,
    scopes: ['crews:manage'],
    createdAt: now
  })
  return generated.token
}

/** POST /api/crews through the route file, as the server runs it: the answer and the status it set. */
async function postCrew(token: string, body: Record<string, unknown>): Promise<{ status: number, body: any }> {
  const event: { token?: string, body: unknown, status?: number } = { token, body }
  try {
    const answer = await (crewsPost as unknown as (e: unknown) => Promise<any>)(event)
    return { status: event.status ?? 200, body: answer }
  } catch (error) {
    // A refusal is thrown as an h3 error: its status and sentence are the answer.
    const e = error as { statusCode?: number, statusMessage?: string, message?: string }
    return { status: e.statusCode ?? 500, body: { message: msgOf(e) } }
  }
}
