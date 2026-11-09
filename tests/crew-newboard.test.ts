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
import { and, asc, eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crews, instanceSettings, member, organization, projectColumns, projects, user } = await import('../server/db/schema')
const { crewTargets, makeCrewOnNewBoard, parseNewBoard } = await import('../server/utils/crewBoards')
const { setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { purgeCrew } = await import('../server/utils/crewProvisioning')
const { DEFAULT_COLUMNS } = await import('../server/utils/teamSettings')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tnb-${tag}-${name}`
const now = Date.now()
const slug = `tnb-${tag}`
const takenSlug = `tnb-${tag}-taken`
const refusedSlug = `tnb-${tag}-no`

const boss = id('boss')
const plain = id('plain')
const outsider = id('outsider')
const realTeam = id('real-team')
const emptyTeam = id('empty-team')
const otherTeam = id('other-team')
const board = { real: id('board-real'), foreign: id('board-foreign') }
const names = { made: 'Fresh board', refused: 'Refused board' }

const caller = (userId: string) => ({ userId, keyId: null, keyName: 'test key' })
const management = (userId: string, boardId: string) => ({ userId, keyId: id('mgmt'), keyName: 'management', boardId })
const product = { name: 'New board product' }
// h3's createError carries the sentence in `message` on some versions and `statusMessage` on others.
const msgOf = (e: { statusMessage?: string, message?: string }) => e.statusMessage ?? e.message
const rejects = (promise: Promise<unknown>, status: number, message?: string) =>
  assert.rejects(promise, (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === status && (message === undefined || msgOf(e) === message))

let made: { made: { status: number, body: any }, boardId: string } | null = null

before(async () => {
  const at = new Date()
  await db.insert(user).values([boss, plain, outsider].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: emptyTeam, name: 'Empty team', slug: emptyTeam, createdAt: at },
    { id: otherTeam, name: 'Other team', slug: otherTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m3'), organizationId: emptyTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m4'), organizationId: otherTeam, userId: outsider, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.real, userId: boss, teamId: realTeam, name: 'Office board', createdAt: now, updatedAt: now },
    { id: board.foreign, userId: outsider, teamId: otherTeam, name: 'Foreign board', createdAt: now, updatedAt: now }
  ])
})

// The instance and team levels of the crew permission on, for the team these tests make boards in.
async function enableLevels() {
  await setInstanceCrews(true, null)
  await setTeamCrews(realTeam, true)
}

after(async () => {
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
  const made = await db.select().from(crews).where(inArray(crews.slug, [slug, takenSlug, refusedSlug]))
  for (const crew of made) await purgeCrew(crew)
  await db.delete(organization).where(inArray(organization.id, [`crew-${takenSlug}`]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, emptyTeam, otherTeam]))
  await db.delete(user).where(inArray(user.id, [boss, plain, outsider]))
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

test('a plain member, a key of another team, and a rotate of the crew already made are refused', async () => {
  await rejects(makeCrewOnNewBoard({ slug: refusedSlug, name: 'Refused', product, rotate: false }, caller(plain), { teamId: realTeam, name: names.refused }), 403, 'Your key may not create boards in that team.')
  await rejects(makeCrewOnNewBoard({ slug: refusedSlug, name: 'Refused', product, rotate: false }, caller(outsider), { teamId: realTeam, name: names.refused }), 403, 'Your key may not create boards in that team.')
  await rejects(makeCrewOnNewBoard({ slug, name: 'New crew', product, rotate: true }, caller(boss), { teamId: realTeam, name: names.refused }), 400, 'A crew that already exists keeps its board; use projectId or no board.')
  await rejects(makeCrewOnNewBoard({ slug, name: 'New crew', product, rotate: false }, caller(boss), { teamId: realTeam, name: names.refused }), 409)
  const refusedBoards = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.teamId, realTeam), eq(projects.name, names.refused)))
  assert.deepEqual(refusedBoards, [], 'a refused call leaves no board behind')
  assert.deepEqual(await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, refusedSlug)), [])
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
