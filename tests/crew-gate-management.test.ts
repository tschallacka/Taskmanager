// The crew gate and the management token (BRIEF-crew-feature 2b, the public URL). The policy cases run on their
// own. The database cases need the dev database with the token tables pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-gate-management.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { decide, type KeyVerdict } from '../server/utils/crewGatePolicy'
import { TOKEN_REFUSAL_MESSAGES } from '../server/utils/connectTokenRules'

// Nitro provides createError and getRequestHeader as globals; the token and gate code expect them.
Object.assign(globalThis, { createError })
let presented = ''
Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${presented}` : undefined) })
const asToken = (token: string) => {
  presented = token
  return {} as never
}

// The imports come first: node's test runner collects only the tests declared before the first await of the file.
const { db } = await import('../server/db')
const { apiKeys, apiKeySecrets, crewBoards, crews, instanceSettings, member, organization, projects, teamSettings, user } = await import('../server/db/schema')
const { generateApiKey } = await import('../server/utils/api-keys')
const { revokeKey, rotateSecret } = await import('../server/utils/connectTokens')
const { remoteManagementVerdict, remoteCrewOwnerVerdict, isManagementToken, checkCrewKey } = await import('../server/utils/crewGate')
const { setBoardCrews, setInstanceCrews, setTeamCrews } = await import('../server/utils/crewPermission')
const { issueManagementToken } = await import('../server/utils/managementToken')

// ── Policy: a remote caller's management token ────────────────────────

const LOCAL = true
const REMOTE = false
const ok = (extra: Partial<Extract<KeyVerdict, { ok: true }>> = {}): KeyVerdict => ({ ok: true, keyId: 'key', ...extra })
const refused = (extra: Partial<Extract<KeyVerdict, { ok: false }>> = {}): KeyVerdict => ({ ok: false, reason: 'bad key', ...extra })

test('remote with the window closed and a live management token: passes', () => {
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: ok({ management: true, boardId: 'b1' }) }), { pass: true })
})

test('remote with the window open and a live management token: passes, and the window is not closed', () => {
  assert.deepEqual(decide({ local: REMOTE, windowOpen: true, tempKeyId: 'temp', verdict: ok({ management: true }) }), { pass: true })
})

test('remote with the window closed and a crews:manage key that is neither a token nor a crew owner\'s: plain 404', () => {
  assert.deepEqual(
    decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: ok({ management: false }) }),
    { pass: false, status: 404, outcome: 'remote, window closed', closeReason: null }
  )
  assert.deepEqual(
    decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: ok() }),
    { pass: false, status: 404, outcome: 'remote, window closed', closeReason: null }
  )
})

test('remote with the window closed and no key, or a key that is not a management token: plain 404', () => {
  assert.equal(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: null }).status, 404)
  assert.equal(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: refused() }).status, 404)
})

test('remote with the window closed and an expired management token: its refusal, nothing closed', () => {
  const step = decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: refused({ reason: 'expired', message: 'This token has expired.', management: true }) })
  assert.deepEqual(step, { pass: false, status: 401, outcome: 'expired', closeReason: null })
})

test('remote with the window closed and a regenerated management token: its refusal, nothing closed', () => {
  const step = decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: refused({ message: 'This token has been regenerated.', management: true }) })
  assert.deepEqual(step, { pass: false, status: 401, outcome: 'bad key', closeReason: null })
})

test('remote with the window open and a failing management token: refused, and the window closes as for any bad key', () => {
  const step = decide({ local: REMOTE, windowOpen: true, tempKeyId: 'temp', verdict: refused({ reason: 'expired', management: true }) })
  assert.deepEqual(step, { pass: false, status: 401, outcome: 'expired', closeReason: 'expired' })
})

test('local calls are decided as before: a valid key passes with the window shut, a failing key is 401', () => {
  assert.deepEqual(decide({ local: LOCAL, windowOpen: false, tempKeyId: null, verdict: ok() }), { pass: true })
  assert.deepEqual(decide({ local: LOCAL, windowOpen: false, tempKeyId: null, verdict: refused() }), { pass: false, status: 401, outcome: 'bad key', closeReason: null })
  assert.deepEqual(decide({ local: LOCAL, windowOpen: false, tempKeyId: null, verdict: null }), { pass: false, status: 401, outcome: 'no key check', closeReason: null })
})

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cgm-${tag}-${name}`
const now = Date.now()
const at = new Date()

const boss = id('boss')
const realTeam = id('real-team')
const board = id('board-real')
const crewId = id('crew')
const adminKeyId = id('admin-key')
const createdTokenKeyIds: string[] = []

before(async () => {
  await db.insert(user).values({ id: boss, name: boss, email: `${boss}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true })
  await db.insert(organization).values({ id: realTeam, name: 'Real team', slug: realTeam, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: boss, teamId: realTeam, name: 'Office board', createdAt: now, updatedAt: now })
  await setInstanceCrews(true, boss)
  await setTeamCrews(realTeam, true)
  await setBoardCrews(board, true)
})

after(async () => {
  await db.delete(apiKeySecrets).where(inArray(apiKeySecrets.tokenId, [...createdTokenKeyIds, adminKeyId]))
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crewId))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, realTeam))
  await db.delete(user).where(eq(user.id, boss))
  await db.delete(teamSettings).where(eq(teamSettings.teamId, realTeam))
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end()
})

test('a remote management token gets a passing verdict bound to its board', async () => {
  const made = await issueManagementToken(boss, board)
  createdTokenKeyIds.push(made.key.id)
  asToken(made.token)
  assert.equal(await isManagementToken({} as never), true)
  const verdict = await remoteManagementVerdict({} as never)
  assert.ok(verdict?.ok, 'the token is accepted')
  assert.equal(verdict.management, true)
  assert.equal(verdict.boardId, board)
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict }), { pass: true })
})

test('the instance admin\'s unbound crews:manage key is not a management token, and passes remotely as a crew owner\'s key', async () => {
  const generated = generateApiKey()
  await db.insert(apiKeys).values({
    id: adminKeyId,
    userId: boss,
    teamId: null,
    name: 'admin crews key',
    keyHash: generated.hash,
    keyPrefix: generated.displayPrefix,
    scopes: ['crews:manage'],
    createdAt: now
  })
  asToken(generated.token)
  assert.equal(await isManagementToken({} as never), false)
  // Not a token, so the remote verdict is the crew-owner one: the admin's key passes for its own crews.
  const viaGate = await remoteManagementVerdict({} as never)
  assert.equal(viaGate?.ok === true && viaGate.crewOwner === true, true)
  assert.equal(viaGate?.ok === true && viaGate.management === true, false)
  // The same key still passes a local call, as today.
  const local = await checkCrewKey({} as never)
  assert.equal(local.ok, true)
  assert.equal(local.ok && local.management, false)
  // Pia's rule: the admin's permanent key passes the gate from outside, for the crews the admin created.
  const remote = await remoteCrewOwnerVerdict({} as never)
  assert.equal(remote?.ok && remote.crewOwner, true)
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict: remote }), { pass: true })
})

test('no key, or an unknown one, is not a management token', async () => {
  asToken('')
  assert.equal(await remoteManagementVerdict({} as never), null)
  asToken(`arn_${randomBytes(16).toString('base64url')}`)
  assert.equal(await remoteManagementVerdict({} as never), null)
})

test('an expired management token answers its own sentence', async () => {
  const made = await issueManagementToken(boss, board)
  createdTokenKeyIds.push(made.key.id)
  await db.update(apiKeys).set({ expiresAt: Date.now() - 1_000 }).where(eq(apiKeys.id, made.key.id))
  asToken(made.token)
  const verdict = await remoteManagementVerdict({} as never)
  assert.ok(verdict && !verdict.ok)
  assert.equal(verdict.reason, 'expired')
  assert.equal(verdict.management, true)
  assert.match(verdict.message ?? '', /expired/)
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict }), { pass: false, status: 401, outcome: 'expired', closeReason: null })
})

test('a regenerated management token answers the regenerated sentence', async () => {
  const made = await issueManagementToken(boss, board)
  createdTokenKeyIds.push(made.key.id)
  const [row] = await db.select({ keyHash: apiKeys.keyHash }).from(apiKeys).where(eq(apiKeys.id, made.key.id))
  await db.transaction(tx => rotateSecret(tx, { id: made.key.id, keyHash: row!.keyHash }))
  asToken(made.token)
  const verdict = await remoteManagementVerdict({} as never)
  assert.ok(verdict && !verdict.ok)
  assert.equal(verdict.management, true)
  assert.match(verdict.message ?? '', /regenerated/)
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict }), { pass: false, status: 401, outcome: 'bad key', closeReason: null })
})

test('a revoked management token answers the revoked sentence, and is still a management token', async () => {
  const made = await issueManagementToken(boss, board)
  createdTokenKeyIds.push(made.key.id)
  assert.equal(await revokeKey(boss, made.key.id), true)
  asToken(made.token)
  assert.equal(await isManagementToken({} as never), true)
  const verdict = await remoteManagementVerdict({} as never)
  assert.ok(verdict && !verdict.ok)
  assert.equal(verdict.management, true)
  assert.equal(verdict.message, TOKEN_REFUSAL_MESSAGES.token_revoked)
  assert.match(verdict.message ?? '', /revoked/)
  assert.deepEqual(decide({ local: REMOTE, windowOpen: false, tempKeyId: null, verdict }), { pass: false, status: 401, outcome: 'bad key', closeReason: null })
})

test('a revoked access token is not a management token: the gate answers 404 for it', async () => {
  const generated = generateApiKey()
  const accessId = id('revoked-access')
  createdTokenKeyIds.push(accessId)
  await db.insert(apiKeys).values({
    id: accessId,
    userId: boss,
    teamId: null,
    name: 'revoked access token',
    keyHash: generated.hash,
    keyPrefix: generated.displayPrefix,
    scopes: ['crews:manage'],
    createdAt: now
  })
  assert.equal(await revokeKey(boss, accessId), true)
  asToken(generated.token)
  assert.equal(await isManagementToken({} as never), false)
  assert.equal(await remoteManagementVerdict({} as never), null)
})
