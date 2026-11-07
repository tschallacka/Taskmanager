/* eslint-disable @typescript-eslint/no-explicit-any -- the bound answer is read loosely: each test checks the fields it names */
// The crew API's boards: the targets a key's owner may bind a crew to (teams > userboards), the crew made
// and bound to a real board in one call, a rotate that keeps the one shadow board, the refusals that leave
// nothing behind, and what detaching leaves. Needs the dev database and the Nuxt aliases the tool modules import:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-userboards.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crews, instanceSettings, member, organization, projects, user } = await import('../server/db/schema')
const { crewTargets, detachCrewLinks, makeBoundCrew } = await import('../server/utils/crewBoards')
const { setBoardCrews, setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { purgeCrew } = await import('../server/utils/crewProvisioning')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tcu-${tag}-${name}`
const now = Date.now()
const slug = `tcu-${tag}`
const refusedSlug = `tcu-${tag}-no`

const boss = id('boss')
const admin = id('admin')
const plain = id('plain')
const outsider = id('outsider')
const realTeam = id('real-team')
const otherTeam = id('other-team')
const board = { real: id('board-real'), archived: id('board-archived'), foreign: id('board-foreign') }

const caller = (userId: string) => ({ userId, keyId: null, keyName: 'test key' })
const rejects = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === status)

let bound: { status: number, body: any } | null = null

before(async () => {
  const at = new Date()
  await db.insert(user).values([boss, admin, plain, outsider].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: otherTeam, name: 'Other team', slug: otherTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: admin, role: 'admin', createdAt: at },
    { id: id('m3'), organizationId: realTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m4'), organizationId: otherTeam, userId: outsider, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.real, userId: boss, teamId: realTeam, name: 'Office board', createdAt: now, updatedAt: now },
    { id: board.archived, userId: boss, teamId: realTeam, name: 'Old board', createdAt: now, updatedAt: now, archivedAt: now },
    { id: board.foreign, userId: outsider, teamId: otherTeam, name: 'Foreign board', createdAt: now, updatedAt: now }
  ])
})

// The three levels of the crew permission on for the board these tests bind crews to. The first test that binds calls it.
async function enableLevels() {
  await setInstanceCrews(true, null)
  await setTeamCrews(realTeam, true)
  await setBoardCrews(board.real, true)
}

after(async () => {
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
  const made = await db.select().from(crews).where(eq(crews.slug, slug))
  for (const crew of made) await purgeCrew(crew)
  await db.delete(projects).where(inArray(projects.id, [board.real, board.archived, board.foreign]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, otherTeam]))
  await db.delete(user).where(inArray(user.id, [boss, admin, plain, outsider]))
  await db.$client.end()
})

test('targets list the boards of the teams the owner or admin runs, and nothing for a plain member', async () => {
  const bossTargets = await crewTargets(boss)
  const team = bossTargets.teams.find(t => t.team_id === realTeam)
  assert.ok(team, 'the owner sees the team')
  assert.equal(team.team_name, 'Real team')
  assert.deepEqual(team.userboards.map(b => b.board_id), [board.real], 'archived and foreign boards are not listed')
  assert.deepEqual(team.userboards[0], { board_id: board.real, board_name: 'Office board', shadowboards: [] })
  assert.ok((await crewTargets(admin)).teams.some(t => t.team_id === realTeam), 'an admin sees the team')
  assert.ok(!(await crewTargets(plain)).teams.some(t => t.team_id === realTeam), 'a plain member does not')
  assert.ok(!(await crewTargets(outsider)).teams.some(t => t.team_id === realTeam), 'another team is not listed')
})

test('making a crew bound to a board gives the userboard, the shadow board and the crew people', async () => {
  await enableLevels()
  bound = await makeBoundCrew({ slug, name: 'Bound crew', product: { name: 'Bound product' }, rotate: false }, caller(boss), { projectId: board.real, teamId: realTeam })
  assert.equal(bound.status, 201)
  const body = bound.body
  assert.equal(body.userboard.board_id, board.real)
  assert.equal(body.userboard.board_name, 'Office board')
  assert.equal(body.real_board.board_id, board.real)
  assert.equal(body.shadow_board.board_id, body.userboard.shadowboards[0].board_id)
  assert.match(body.shadow_board.url, new RegExp(`/projects/${body.shadow_board.board_id}$`))
  assert.match(body.real_board.url, new RegExp(`/projects/${board.real}$`))

  const [shadow] = body.userboard.shadowboards
  assert.equal(shadow.user_id, boss, 'the key owner attached it')
  const tags = shadow.crew_ids.map((c: { tag: string }) => c.tag)
  assert.ok(tags.includes('@wren') && tags.includes('@pia') && tags.includes('@boss'))
  assert.ok(!tags.includes('@customer') && !tags.includes('@contact'), 'customer logins are not crew people')
  assert.deepEqual(Object.keys(shadow.crew_ids[0]).sort(), ['id', 'tag'])

  const [row] = await db.select().from(projects).where(eq(projects.id, body.shadow_board.board_id))
  assert.equal(row!.teamId, body.team.id, 'the shadow board is in the crew team')
  assert.equal(body.people.wren.apiKey.startsWith('arn_'), true, 'the answer keeps the people and keys as before')
})

test('the crew work board and the shadow board are not offered as targets', async () => {
  const crewTeam = bound!.body.team.id
  const entry = (await crewTargets(boss)).teams.find(t => t.team_id === crewTeam)
  assert.ok(entry, 'the crew team is listed for its owner')
  const offered = entry.userboards.map(b => b.board_id)
  assert.ok(!offered.includes(bound!.body.crew.boardId))
  assert.ok(!offered.includes(bound!.body.shadow_board.board_id))
  const real = (await crewTargets(boss)).teams.find(t => t.team_id === realTeam)!.userboards.find(b => b.board_id === board.real)
  assert.equal(real!.shadowboards.length, 1, 'the real board lists its shadow board')
})

test('a rotate of a crew bound to the board keeps its one shadow board', async () => {
  const rotated = await makeBoundCrew({ slug, name: 'Bound crew', product: { name: 'Bound product' }, rotate: true }, caller(boss), { projectId: board.real, teamId: realTeam })
  assert.equal(rotated.status, 200)
  assert.equal(rotated.body.shadow_board.board_id, bound!.body.shadow_board.board_id)
  assert.equal(rotated.body.userboard.shadowboards.length, 1)
  assert.notEqual(rotated.body.people.wren.apiKey, bound!.body.people.wren.apiKey)
  bound = rotated
})

test('a refused binding makes no crew at all', async () => {
  const bind = (projectId: unknown, teamId: unknown, who: string) => makeBoundCrew({ slug: refusedSlug, name: 'Refused', product: { name: 'Refused' }, rotate: false }, caller(who), { projectId, teamId })
  await rejects(bind(board.foreign, realTeam, boss), 404)
  await rejects(bind(board.foreign, undefined, boss), 403)
  await rejects(bind(board.archived, realTeam, boss), 400)
  await rejects(bind(board.real, realTeam, plain), 403)
  await rejects(bind(board.real, otherTeam, boss), 404)
  await rejects(bind('', realTeam, boss), 400)
  assert.deepEqual(await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, refusedSlug)), [])
})

test('detaching takes the crew off the board and archives its shadow board', async () => {
  const crewId = bound!.body.crew.id
  const shadowId = bound!.body.shadow_board.board_id
  await detachCrewLinks(crewId)
  const real = (await crewTargets(boss)).teams.find(t => t.team_id === realTeam)!.userboards.find(b => b.board_id === board.real)
  assert.deepEqual(real!.shadowboards, [])
  const [shadow] = await db.select().from(projects).where(eq(projects.id, shadowId))
  assert.ok(shadow!.archivedAt, 'the shadow board is archived, its notes kept')
})
