// The instance admin's crew calls are never held by the three switches (crewPermission.ts): with every switch off the
// admin still lists the targets, makes a bound crew, rotates it, makes a management token and deletes the crew, exactly
// as the existing crew API does. A non-admin is refused until all three are on, and a switch that is turned off
// disables only the crews of people other than the instance admin. Needs the dev database with the crew tables pushed.
// Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-admin.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })
let presented = ''
Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${presented}` : undefined) })
const asToken = (token: string) => {
  presented = token
  return {} as never
}

const { db } = await import('../server/db')
const { apiKeys, crewBoards, crews, instanceSettings, member, organization, projects, teamSettings, user } = await import('../server/db/schema')
const { authenticateApiKey } = await import('../server/utils/api-keys')
const { crewTargets, makeBoundCrew, attachCrew } = await import('../server/utils/crewBoards')
const { purgeCrew, requireCrewManager } = await import('../server/utils/crewProvisioning')
const { CREW_SENTENCES, crewPermissionRefusal, crewRefusal, setBoardCrews, setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { issueManagementToken } = await import('../server/utils/managementToken')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cad-${tag}-${name}`
const now = Date.now()
const at = new Date()

const root = id('root') // the instance admin, owner of the team
const owner = id('owner') // an owner of the team who is not the instance admin
const team = id('team')
const crewTeam = id('crew-team')
const board = { main: id('board-main'), shadow: id('shadow') }
const adminSlug = `cad-${tag}-a`
const ownerCrewId = id('owner-crew')
const ownerSlug = `cad-${tag}-o`
const caller = (userId: string) => ({ userId, keyId: null, keyName: 'test key' })

const rejectsWith = (promise: Promise<unknown>, sentence: string) =>
  assert.rejects(promise, (e: { statusCode?: number, message?: string }) => e.statusCode === 403 && e.message === sentence)

async function everySwitchOff() {
  await setInstanceCrews(false, root)
  await setTeamCrews(team, false)
  await setBoardCrews(board.main, false)
}

before(async () => {
  await db.insert(user).values([root, owner].map(u => ({
    id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: u === root
  })))
  await db.insert(organization).values([
    { id: team, name: 'Admin team', slug: team, createdAt: at },
    { id: crewTeam, name: 'Admin crew team', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: root, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: owner, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.main, userId: root, teamId: team, name: 'Admin board', createdAt: now, updatedAt: now },
    { id: board.shadow, userId: root, teamId: crewTeam, name: 'Owner shadow (crew)', createdAt: now, updatedAt: now }
  ])
  await everySwitchOff()
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.projectId, board.main))
  await db.delete(crews).where(inArray(crews.id, [ownerCrewId]))
  const left = await db.select().from(crews).where(eq(crews.createdBy, root))
  for (const crew of left) await purgeCrew(crew)
  await db.delete(apiKeys).where(eq(apiKeys.userId, root))
  await db.delete(projects).where(inArray(projects.id, Object.values(board)))
  await db.delete(organization).where(inArray(organization.id, [team, crewTeam]))
  await db.delete(user).where(inArray(user.id, [root, owner]))
  await db.delete(teamSettings).where(eq(teamSettings.teamId, team))
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
})

test('with every switch off, the instance admin lists the targets, makes, rotates, uses a token and deletes a bound crew', async () => {
  await everySwitchOff()
  const targets = await crewTargets(root)
  assert.ok(targets.teams.some(t => t.team_id === team), 'the admin still sees the team and its boards')

  const made = await makeBoundCrew({ slug: adminSlug, name: 'Admin crew', product: { name: 'Admin product' }, rotate: false }, caller(root), { projectId: board.main, teamId: team })
  assert.equal(made.status, 201)

  const rotated = await makeBoundCrew({ slug: adminSlug, name: 'Admin crew', product: { name: 'Admin product' }, rotate: true }, caller(root), { projectId: board.main, teamId: team })
  assert.equal(rotated.status, 200)

  const made2 = await issueManagementToken(root, board.main)
  const managed = await requireCrewManager(asToken(made2.token))
  assert.equal(managed.boardId, board.main)
  await authenticateApiKey(asToken(made2.token))

  const [crew] = await db.select().from(crews).where(eq(crews.slug, adminSlug))
  assert.equal(crew!.disabledAt, null, 'the admin crew is not disabled by the switches')
  await purgeCrew(crew!)
  const after2 = await db.select().from(crews).where(eq(crews.slug, adminSlug))
  assert.equal(after2.length, 0, 'the admin deletes the crew')
})

test('a non-admin is refused until all three switches are on', async () => {
  await everySwitchOff()
  assert.equal(await crewPermissionRefusal(owner, board.main), CREW_SENTENCES.instance)
  await rejectsWith(makeBoundCrew({ slug: ownerSlug, name: 'Owner crew', product: { name: 'Owner product' }, rotate: false }, caller(owner), { projectId: board.main, teamId: team }), CREW_SENTENCES.instance)

  await setInstanceCrews(true, root)
  assert.equal(await crewPermissionRefusal(owner, board.main), CREW_SENTENCES.team)
  await setTeamCrews(team, true)
  assert.equal(await crewPermissionRefusal(owner, board.main), CREW_SENTENCES.board)
  await setBoardCrews(board.main, true)
  assert.equal(await crewPermissionRefusal(owner, board.main), null)
  await everySwitchOff()
})

test('a switch turned off disables only the crews of people other than the instance admin', async () => {
  await setInstanceCrews(true, root)
  await setTeamCrews(team, true)
  await setBoardCrews(board.main, true)

  // The admin's crew, and an owner's crew (made by the owner, which the admin does not own) on the same board.
  await makeBoundCrew({ slug: adminSlug, name: 'Admin crew', product: { name: 'Admin product' }, rotate: false }, caller(root), { projectId: board.main, teamId: team })
  await db.insert(crews).values({ id: ownerCrewId, slug: ownerSlug, name: 'Owner crew', teamId: crewTeam, createdBy: owner, createdAt: now })
  const [ownerCrew] = await db.select().from(crews).where(eq(crews.id, ownerCrewId))
  await attachCrew({ crew: ownerCrew!, projectId: board.main, teamId: team, userId: owner })

  await setTeamCrews(team, false)
  const [adminCrew] = await db.select().from(crews).where(eq(crews.slug, adminSlug))
  const [ownerAfterTeam] = await db.select().from(crews).where(eq(crews.id, ownerCrewId))
  assert.ok(ownerAfterTeam!.disabledAt, 'the team switch disables the owner\'s crew on its board')
  assert.equal(adminCrew!.disabledAt, null, 'the team switch leaves the admin\'s crew alone')

  await setTeamCrews(team, true)
  await setBoardCrews(board.main, true)
  await setInstanceCrews(false, root)
  const [adminAfterInstance] = await db.select().from(crews).where(eq(crews.slug, adminSlug))
  assert.equal(adminAfterInstance!.disabledAt, null, 'turning the instance switch off leaves the admin\'s crew enabled')
  assert.equal(await crewRefusal(adminAfterInstance!), null, 'and the admin\'s crew still works')
  await setInstanceCrews(true, root)
})
