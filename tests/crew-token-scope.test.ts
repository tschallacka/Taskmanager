// The crew-scoped token (card mwdd9d2vtgqhfr6izq): it reaches its own crew's keys and people routes only. The route rule
// and the crew check are pure, so they run without a database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/crew-token-scope.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'

Object.assign(globalThis, { createError })

const { scopedAllows, scopedSlugOf, SCOPED_TOKEN_SENTENCE } = await import('../server/utils/crewKeyScope')
const { requireCrewOnOwnBoard } = await import('../server/utils/managementToken')

test('a scoped token may POST the keys and people routes of a crew, and nothing else', () => {
  assert.equal(scopedSlugOf('POST', '/api/crews/acme/keys'), 'acme')
  assert.equal(scopedSlugOf('POST', '/api/crews/acme/people'), 'acme')
  assert.equal(scopedSlugOf('POST', '/api/crews/acme/keys?format=json'), 'acme', 'the query is not part of the route')
  assert.equal(scopedSlugOf('GET', '/api/crews/acme/keys'), null, 'a read is not one of its routes')
  assert.equal(scopedSlugOf('POST', '/api/crews/acme'), null, 'the crew itself is not one of its routes')
  assert.equal(scopedSlugOf('POST', '/api/crews/acme/rotate'), null)
  assert.equal(scopedSlugOf('POST', '/api/projects/abc/tasks'), null, 'other routes are refused by the middleware')
  assert.equal(scopedSlugOf('POST', '/api/crews/acme/keys/extra'), null)
})

test('a scoped token reaches its own crew by id, and another crew gets the board sentence', async () => {
  const caller = { userId: 'u1', keyId: 'k1', keyName: 'crew token', boardId: 'shadow-1', crewId: 'crew-a' }
  await requireCrewOnOwnBoard(caller as never, { id: 'crew-a', slug: 'acme' } as never)
  await assert.rejects(
    requireCrewOnOwnBoard(caller as never, { id: 'crew-b', slug: 'other' } as never),
    (error: { statusCode?: number, message?: string }) => error.statusCode === 403 && error.message === 'This token works on its own board only.'
  )
})

// The middleware's decision (scopedAllows) is what refuses a route. Every route but the two, and the two for another crew,
// are refused; the two for the key's own crew are allowed.
test('the middleware refuses every route but the two of its own crew: other routes, reads, another crew, and no crew', () => {
  const keyCrewId = 'crew-a'
  const allowed = (method: string, path: string, slugCrewId: string | null) =>
    scopedAllows({ method, path, keyCrewId, slugCrewId })
  assert.equal(allowed('POST', '/api/crews/acme/keys', 'crew-a'), true)
  assert.equal(allowed('POST', '/api/crews/acme/people', 'crew-a'), true)
  assert.equal(allowed('POST', '/api/crews/acme/keys', 'crew-b'), false, 'another crew\'s keys route')
  assert.equal(allowed('POST', '/api/crews/acme/keys', null), false, 'a slug that names no crew')
  assert.equal(allowed('GET', '/api/crews/acme/keys', 'crew-a'), false, 'a read of its own crew')
  assert.equal(allowed('POST', '/api/crews/acme', 'crew-a'), false, 'the crew itself')
  assert.equal(allowed('POST', '/api/crews/acme/rotate', 'crew-a'), false)
  assert.equal(allowed('POST', '/api/projects/abc/tasks', 'crew-a'), false, 'a board route')
  assert.equal(allowed('POST', '/api/settings/api-keys/management', 'crew-a'), false, 'the token route itself')
  assert.equal(allowed('POST', '/api/crews/acme/keys/extra', 'crew-a'), false)
})

test('the refusal sentence is the board sentence, the same one every other scoped refusal gives', () => {
  assert.equal(SCOPED_TOKEN_SENTENCE, 'This token works on its own board only.')
})
