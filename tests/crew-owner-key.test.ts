// A crew owner's own permanent crews:manage key, used from a remote address: what the gate and the crew routes
// let it do. The gate rules are checked with decide() (no database); the routes with requireCrewOnOwnBoard and
// friends on a crew object and a scratch slug. Needs DATABASE_URL to a scratch database (arnotes_test_<key>); it
// writes nothing. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-owner-key.test.ts
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import type { Crew } from '../server/db/schema'
import { decide, NO_LIVE_CREW_SENTENCE } from '../server/utils/crewGatePolicy'
import { CREATE_NEEDS_TOKEN, DELETE_NEEDS_TOKEN, requireCrewOnlyOnOwnBoard, requireCrewOnOwnBoard, requireCreateOnOwnBoard } from '../server/utils/managementToken'
import type { CrewCaller } from '../server/utils/crewProvisioning'

const OWNER = 'user-owner-test'
const OTHER = 'user-other-test'
const ownCrew = { id: 'crew-own', slug: 'scratch-own', createdBy: OWNER } as unknown as Crew
const foreignCrew = { id: 'crew-foreign', slug: 'scratch-foreign', createdBy: OTHER } as unknown as Crew
const ownerCaller: CrewCaller = { userId: OWNER, keyId: 'key-own', keyName: 'owner key', boardId: null, crewOwner: true }
const otherCaller: CrewCaller = { userId: OTHER, keyId: 'key-other', keyName: 'other key', boardId: null, crewOwner: true }

async function refusalStatus(run: () => Promise<unknown>): Promise<{ statusCode?: number, message?: string } | null> {
  try {
    await run()
    return null
  } catch (error) {
    return error as { statusCode?: number, message?: string }
  }
}

test('a remote crew owner key passes the gate with the window shut', () => {
  const verdict = { ok: true as const, keyId: 'key-own', crewOwner: true, boardId: null }
  assert.deepEqual(decide({ local: false, windowOpen: false, tempKeyId: null, verdict }), { pass: true })
})

test('a remote crew owner key passes while the window is open too, and does not close it', () => {
  const verdict = { ok: true as const, keyId: 'key-own', crewOwner: true, boardId: null }
  assert.deepEqual(decide({ local: false, windowOpen: true, tempKeyId: 'key-window', verdict }), { pass: true })
})

test('the 403 sentence names the owner having no live crew, and points at the sidebar token', () => {
  assert.match(NO_LIVE_CREW_SENTENCE, /no live crew/)
  assert.match(NO_LIVE_CREW_SENTENCE, /management token from the board's sidebar/)
})

test('the owner reaches its own crew', async () => {
  assert.equal(await refusalStatus(() => requireCrewOnOwnBoard(ownerCaller, ownCrew)), null)
})

test('another person\'s crew answers 404 to a crew owner key', async () => {
  const refusal = await refusalStatus(() => requireCrewOnOwnBoard(ownerCaller, foreignCrew))
  assert.equal(refusal?.statusCode, 404)
  const other = await refusalStatus(() => requireCrewOnOwnBoard(otherCaller, ownCrew))
  assert.equal(other?.statusCode, 404)
})

test('a crew owner key cannot delete its crew: the route answers 403 with the token sentence', async () => {
  const refusal = await refusalStatus(() => requireCrewOnlyOnOwnBoard(ownerCaller, ownCrew))
  assert.equal(refusal?.statusCode, 403)
  assert.equal(refusal?.message, DELETE_NEEDS_TOKEN)
})

test('a crew owner key cannot make a new crew, nor bind one to a board', async () => {
  const fresh = `scratch-owner-${Date.now().toString(36)}`
  const make = await refusalStatus(() => requireCreateOnOwnBoard(ownerCaller, fresh, undefined))
  assert.equal(make?.statusCode, 403)
  assert.equal(make?.message, CREATE_NEEDS_TOKEN)
  const bind = await refusalStatus(() => requireCreateOnOwnBoard(ownerCaller, fresh, 'some-board'))
  assert.equal(bind?.statusCode, 403)
})

// Minting: a non-admin who owns a live crew may mint an unbound crews:manage key (Boss, 2026-11-09). These run
// against the database: the owner's live crew is a row, so the rule reads it as it does in production.
// The helpers under test expect Nitro's global createError.
Object.assign(globalThis, { createError })
const { db } = await import('../server/db')
const { crews, organization, user } = await import('../server/db/schema')
const { requireCrewKeyRights } = await import('../server/utils/keyIssue')
const { CREW_SENTENCES } = await import('../server/utils/crewPermission')
const { allowCrews, clearCrewLevels } = await import('./helpers/crewLevels')

const tag = randomBytes(4).toString('hex')
const liveOwner = `cok-${tag}-live`
const disabledOwner = `cok-${tag}-disabled`
const plainUser = `cok-${tag}-plain`
const team = `cok-${tag}-team`
const at = new Date()
const eventOf = (userId: string) => ({ context: { session: { user: { id: userId } } } }) as unknown as H3Event

test('a non-admin who owns a live crew may mint an unbound crews:manage key', async () => {
  await db.insert(user).values([liveOwner, disabledOwner, plainUser].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values({ id: team, name: team, slug: team, createdAt: at })
  await db.insert(crews).values([
    { id: `${team}-live`, slug: `cok-${tag}-live`, name: 'Live', teamId: team, createdBy: liveOwner, createdAt: Date.now() },
    { id: `${team}-off`, slug: `cok-${tag}-off`, name: 'Off', teamId: team, createdBy: disabledOwner, createdAt: Date.now(), disabledAt: Date.now() }
  ])
  try {
    await allowCrews(null, team, [])
    assert.equal(await refusalStatus(() => requireCrewKeyRights(eventOf(liveOwner), null)), null)
  } finally {
    await clearCrewLevels()
  }
})

test('a non-admin with no live crew may not mint an unbound crews:manage key', async () => {
  // The instance level must be on, or the instance sentence would answer first.
  await allowCrews(null, team, [])
  try {
    const plain = await refusalStatus(() => requireCrewKeyRights(eventOf(plainUser), null))
    assert.equal(plain?.statusCode, 403)
    assert.equal(plain?.message, CREW_SENTENCES.noBoard)
    const disabled = await refusalStatus(() => requireCrewKeyRights(eventOf(disabledOwner), null))
    assert.equal(disabled?.statusCode, 403)
    assert.equal(disabled?.message, CREW_SENTENCES.noBoard)
  } finally {
    await clearCrewLevels()
  }
})

after(async () => {
  await db.delete(crews).where(inArray(crews.id, [`${team}-live`, `${team}-off`]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [liveOwner, disabledOwner, plainUser]))
})
