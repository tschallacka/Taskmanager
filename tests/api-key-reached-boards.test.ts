// The boards each API key reaches, listed by name and workspace: a crew's real board through its link is
// listed read-only, and a board of a team the owner has left is not listed. Needs the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/api-key-reached-boards.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { allowCrews } = await import('./helpers/crewLevels')
const { apiKeys, apiKeyWorkspaces, crews, member, organization, projects, user } = schema
const { attachCrew } = await import('../server/utils/crewBoards')
const { reachedBoardsOf } = await import('../server/utils/keyReach')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `arb-${tag}-${name}`
const now = Date.now()
const at = new Date()

const boss = id('boss')
const crewMember = id('crew-member')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real')
const bossKey = id('key-boss')
const crewKey = id('key-crew')
const bossMembership = id('m1')

let shadowBoard = ''

async function insertKey(keyId: string, userId: string, teamId: string | null, workspaceTeamIds: string[]) {
  await db.insert(apiKeys).values({ id: keyId, userId, teamId, name: keyId, keyHash: id(`hash-${keyId}`), keyPrefix: 'arn_', createdAt: now, boardReachSet: true })
  if (workspaceTeamIds.length) {
    await db.insert(apiKeyWorkspaces).values(workspaceTeamIds.map(workspace => ({ id: id(`ws-${keyId}-${workspace}`), keyId, teamId: workspace, createdAt: now })))
  }
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  return row!
}

before(async () => {
  await db.insert(user).values([boss, crewMember].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: bossMembership, organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug: `arb-${tag}`, name: 'Reach crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await db.update(user).set({ crewId }).where(eq(user.id, crewMember))
  await db.insert(projects).values({ id: realBoard, userId: boss, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now })
  await allowCrews(boss, realTeam, [realBoard])
  const link = await attachCrew({ crew: (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!, projectId: realBoard, teamId: realTeam, userId: boss })
  shadowBoard = link.shadowProjectId
})

after(async () => {
  await db.delete(apiKeys).where(inArray(apiKeys.id, [bossKey, crewKey]))
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), realBoard]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [boss, crewMember]))
  await db.$client.end()
})

test('a crew reads its real board through its link: it is listed read-only, by its workspace name, and its shadow board is listed as its own', async () => {
  const key = await insertKey(crewKey, crewMember, crewTeam, [crewTeam])
  const listed = (await reachedBoardsOf(crewMember, [key])).get(crewKey) ?? []
  const real = listed.find(board => board.id === realBoard)
  assert.ok(real, 'the real board is listed')
  assert.equal(real.readOnly, true, 'a board the crew only reads through its link is read-only')
  assert.equal(real.workspace, realTeam, 'the workspace is named, though the crew is not a member of it')
  const shadow = listed.find(board => board.id === shadowBoard)
  assert.ok(shadow, 'the shadow board is listed')
  assert.equal(shadow.readOnly, false, 'the shadow board is the crew\'s to change')
})

test('a board of a team the owner has left is not listed: neither the real board nor its shadow board', async () => {
  const key = await insertKey(bossKey, boss, realTeam, [realTeam])
  const before = (await reachedBoardsOf(boss, [key])).get(bossKey) ?? []
  assert.ok(before.some(board => board.id === realBoard && board.readOnly === false), 'the real board is reached while the owner is in its workspace')
  const shadowBefore = before.find(board => board.id === shadowBoard)
  assert.ok(shadowBefore, 'the shadow board is listed while the owner is in the real board\'s workspace')
  assert.equal(shadowBefore.readOnly, true, 'and it is read-only, a crew shadow of that workspace')
  await db.delete(member).where(eq(member.id, bossMembership))
  try {
    const after = (await reachedBoardsOf(boss, [key])).get(bossKey) ?? []
    assert.ok(!after.some(board => board.id === realBoard), 'the real board is gone once the owner left its workspace')
    assert.ok(!after.some(board => board.id === shadowBoard), 'the shadow board is gone once the owner left its workspace')
  } finally {
    await db.insert(member).values({ id: id('m1-back'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at })
  }
})
