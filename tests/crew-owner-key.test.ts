// A crew owner's own permanent crews:manage key, used from a remote address: what the gate and the crew routes
// let it do. The gate rules are checked with decide() (no database); the routes with requireCrewOnOwnBoard and
// friends on a crew object and a scratch slug. Needs DATABASE_URL to a scratch database (arnotes_test_<key>); it
// writes nothing. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-owner-key.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
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
