// The crew permission: the instance, team and board levels (server/utils/crewPermission.ts). All 8 on/off combinations
// for making a management token, for an existing crew's keys and for a rotate; a crew of a switched-off level is
// disabled, a crew works on one board only, and a crew's key stops when its owner loses the board. Needs the dev
// database with the crew tables pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-permission.test.ts
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
const { attachCrew, detachCrewLinks, makeBoundCrew } = await import('../server/utils/crewBoards')
const { CREW_SENTENCES, crewPermissionRefusal, crewRefusal, setBoardCrews, setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { issueManagementToken } = await import('../server/utils/managementToken')
const { requireCrewKeyRights } = await import('../server/utils/keyIssue')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `crp-${tag}-${name}`
const now = Date.now()
const at = new Date()

const root = id('root') // instance admin, owner of the team
const owner = id('owner') // not the instance admin, owner of the team
const member_ = id('member') // a plain member of the team
const team = id('team')
const crewTeam = id('crew-team')
const board = { main: id('board-main'), second: id('board-second'), shadow: id('shadow'), shadowSecond: id('shadow-second') }
const crewId = id('crew')
const crewSlug = `crp-${tag}`
const crewUser = id('crew-user')

const rejectsWith = (promise: Promise<unknown>, sentence: string) =>
  assert.rejects(promise, (e: { statusCode?: number, message?: string }) => e.statusCode === 403 && e.message === sentence)

async function setLevels(instance: boolean, teamOn: boolean, boardOn: boolean) {
  await setInstanceCrews(instance, root)
  await setTeamCrews(team, teamOn)
  await setBoardCrews(board.main, boardOn)
}

/** The sentence the levels should give for a combination: the first level that is off, or none. */
function expectedRefusal(instance: boolean, teamOn: boolean, boardOn: boolean): string | null {
  if (!instance) return CREW_SENTENCES.instance
  if (!teamOn) return CREW_SENTENCES.team
  if (!boardOn) return CREW_SENTENCES.board
  return null
}

before(async () => {
  await db.insert(user).values([root, owner, member_].map(u => ({
    id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: u === root
  })))
  await db.insert(organization).values([
    { id: team, name: 'Permission team', slug: team, createdAt: at },
    { id: crewTeam, name: 'Permission crew team', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: root, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: team, userId: member_, role: 'member', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.main, userId: root, teamId: team, name: 'Permission board', createdAt: now, updatedAt: now },
    { id: board.second, userId: root, teamId: team, name: 'Permission second board', createdAt: now, updatedAt: now },
    { id: board.shadow, userId: root, teamId: crewTeam, name: 'Shadow (crew)', createdAt: now, updatedAt: now },
    { id: board.shadowSecond, userId: root, teamId: crewTeam, name: 'Shadow second (crew)', createdAt: now, updatedAt: now }
  ])
  // A crew of the owner, made before the levels were tested, on the main board.
  await db.insert(crews).values({ id: crewId, slug: crewSlug, name: 'Permission crew', teamId: crewTeam, createdBy: owner, createdAt: now })
  await db.insert(crewBoards).values({ id: id('link'), crewId, projectId: board.main, shadowProjectId: board.shadow, createdAt: now })
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crewId))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(apiKeys).where(eq(apiKeys.userId, crewUser))
  await db.delete(projects).where(inArray(projects.id, Object.values(board)))
  await db.delete(organization).where(inArray(organization.id, [team, crewTeam]))
  await db.delete(user).where(inArray(user.id, [root, owner, member_, crewUser]))
  await db.delete(teamSettings).where(eq(teamSettings.teamId, team))
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
})

test('all 8 on/off combinations: a management token and the crew of the board follow the three levels', async () => {
  for (const instance of [true, false]) {
    for (const teamOn of [true, false]) {
      for (const boardOn of [true, false]) {
        await setLevels(instance, teamOn, boardOn)
        const label = `instance ${instance}, team ${teamOn}, board ${boardOn}`
        const expected = expectedRefusal(instance, teamOn, boardOn)
        assert.equal(await crewPermissionRefusal(owner, board.main), expected, label)
        if (expected) {
          await rejectsWith(issueManagementToken(owner, board.main), expected)
        } else {
          const made = await issueManagementToken(owner, board.main)
          const caller = await authenticateApiKey(asToken(made.token))
          assert.equal(caller.projectId, board.main, label)
          await revokeOwnerKey(made.key.id)
        }
        // The existing crew of the owner answers the same way, on every call. A switch off disabled it before, so it is re-enabled here.
        await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
        const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
        assert.equal(await crewRefusal(crew!), expected, label)
      }
    }
  }
  await setLevels(true, true, true)
})

test('a rotate of the crew for a board goes the same way, and refused rotates change nothing', async () => {
  const input = { slug: crewSlug, name: 'Permission crew', product: { name: 'Permission product' }, rotate: true }
  const caller = { userId: owner, keyId: null, keyName: 'test' }
  await setInstanceCrews(false, root)
  await rejectsWith(makeBoundCrew(input, caller, { projectId: board.main, teamId: team }), CREW_SENTENCES.instance)
  await setInstanceCrews(true, root)
  await setTeamCrews(team, false)
  await rejectsWith(makeBoundCrew(input, caller, { projectId: board.main, teamId: team }), CREW_SENTENCES.team)
  await setTeamCrews(team, true)
  await setBoardCrews(board.main, false)
  await rejectsWith(makeBoundCrew(input, caller, { projectId: board.main, teamId: team }), CREW_SENTENCES.board)
  await setBoardCrews(board.main, true)
  await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
})

test('switching a level off disables the crews below it, and turning it on again does not re-enable them', async () => {
  await setLevels(true, true, true)
  await setBoardCrews(board.main, false)
  let [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  assert.ok(crew!.disabledAt, 'the board level switched off disables the crew of that board')
  await setBoardCrews(board.main, true)
  ;[crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  assert.ok(crew!.disabledAt, 'turning it on again does not re-enable the crew by itself')
  assert.equal(await crewRefusal(crew!), CREW_SENTENCES.disabled)

  await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
  await setTeamCrews(team, false)
  ;[crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  assert.ok(crew!.disabledAt, 'the team level switched off disables the crews on its boards')
  await setTeamCrews(team, true)

  await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
  await setInstanceCrews(false, root)
  ;[crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  assert.ok(crew!.disabledAt, 'the instance level switched off disables every crew')
  await setInstanceCrews(true, root)
})

test('a crew works on one board only', async () => {
  await setLevels(true, true, true)
  await setBoardCrews(board.second, true)
  await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  await assert.rejects(attachCrew({ crew: crew!, projectId: board.second, teamId: team, userId: owner }), (e: { statusCode?: number }) => e.statusCode === 400)
})

test('a crew key stops when its owner loses the board', async () => {
  await setLevels(true, true, true)
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  assert.equal(await crewRefusal(crew!), null)
  await db.delete(member).where(eq(member.userId, owner))
  try {
    assert.equal(await crewRefusal(crew!), CREW_SENTENCES.notAdmin)
  } finally {
    await db.insert(member).values({ id: id('m-back'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  }
})

test('a key of a person who is not the instance admin must be bound to a board, and the levels reach it', async () => {
  await setLevels(true, true, true)
  const event = (userId: string) => ({ context: { session: { user: { id: userId } } } }) as never
  await rejectsWith(requireCrewKeyRights(event(owner), null).then(() => null), CREW_SENTENCES.noBoard)
  await requireCrewKeyRights(event(owner), board.main)
  await setBoardCrews(board.main, false)
  await rejectsWith(requireCrewKeyRights(event(owner), board.main).then(() => null), CREW_SENTENCES.board)
  await setBoardCrews(board.main, true)
  await requireCrewKeyRights(event(root), null)
  await setInstanceCrews(false, root)
  // The instance admin is never held by the switches: the admin's key passes with the instance switch off too.
  await requireCrewKeyRights(event(root), null)
  await setInstanceCrews(true, root)
})

test('a plain member of the team never gets a crew token', async () => {
  await setLevels(true, true, true)
  await assert.rejects(issueManagementToken(member_, board.main), (e: { statusCode?: number }) => e.statusCode === 403)
})

test('a crew of the owner is detached cleanly', async () => {
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  await detachCrewLinks(crew!.id)
  const links = await db.select().from(crewBoards).where(eq(crewBoards.crewId, crewId))
  assert.equal(links.length, 0)
})

async function revokeOwnerKey(keyId: string) {
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId))
}
