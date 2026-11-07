// Browser verification (device flow), without a database: the codes and their digests, the start call that an agent
// makes, the narrowing of what a person approves, the poll timing, and the messages an agent is given. Run:
//   node --import tsx --test tests/pairing-device-rules.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'
import {
  DEVICE_POLL_INTERVAL_SECONDS,
  DEVICE_REFUSAL_MESSAGES,
  deviceCodeDigest,
  deviceRefusal,
  generateDeviceCode,
  generateUserCode,
  isDeviceRequestExpired,
  isPollTooSoon,
  narrowGrant,
  readStartRequest,
  slowDown,
  unknownDeviceCode,
  userCodeDigest
} from '../server/utils/deviceFlow'

Object.assign(globalThis, { createError })

type RefusalError = { statusCode: number, message: string, data?: { code?: string, interval?: number } }

/** An error the code builds and returns, rather than throws. */
function errorOf(make: () => unknown): RefusalError {
  return make() as RefusalError
}

function refusalOf(run: () => unknown): { statusCode: number, message: string, data?: { code?: string, interval?: number } } {
  try {
    run()
  } catch (error) {
    return error as { statusCode: number, message: string, data?: { code?: string, interval?: number } }
  }
  assert.fail('expected a refusal')
}

describe('codes', () => {
  test('a user code is shaped XXXX-XXXX from unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateUserCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
    }
  })

  test('a device code is long and random, and its digest is stable', () => {
    const a = generateDeviceCode()
    const b = generateDeviceCode()
    assert.notEqual(a, b)
    assert.ok(a.length >= 40)
    assert.equal(deviceCodeDigest(a), deviceCodeDigest(a))
    assert.match(deviceCodeDigest(a)!, /^[0-9a-f]{64}$/)
  })

  test('a user code is found however it is typed: case, spaces and hyphens do not matter', () => {
    const digest = userCodeDigest('ABCD-EFGH')
    assert.equal(userCodeDigest('abcd efgh'), digest)
    assert.equal(userCodeDigest(' abcdefgh '), digest)
    assert.notEqual(userCodeDigest('ABCD-EFGJ'), digest)
  })

  test('text that cannot be a code gets no digest at all', () => {
    assert.equal(userCodeDigest('ABCD-EFG0'), null, 'the zero is not in the alphabet')
    assert.equal(userCodeDigest('ABC'), null)
    assert.equal(userCodeDigest(42), null)
    assert.equal(deviceCodeDigest('short'), null)
    assert.equal(deviceCodeDigest(undefined), null)
  })
})

describe('the start call', () => {
  test('a request names its client and the boards with the permissions it needs', () => {
    const request = readStartRequest({
      client_name: '  Claude Code on my laptop ',
      boards: [{ boardId: 'b1', scopes: ['boards:write', 'boards:read'] }, { boardId: 'b2', scopes: ['boards:read'] }]
    })
    assert.equal(request.clientName, 'Claude Code on my laptop')
    assert.deepEqual(request.requested, [
      { boardId: 'b1', scopes: ['boards:read', 'boards:write'] },
      { boardId: 'b2', scopes: ['boards:read'] }
    ])
  })

  test('a request without a name, without boards, or with a board twice is refused', () => {
    assert.match(refusalOf(() => readStartRequest({ boards: [{ boardId: 'b', scopes: ['boards:read'] }] })).message, /Give the client a name/)
    assert.match(refusalOf(() => readStartRequest({ client_name: 'x', boards: [] })).message, /at least one board/)
    assert.match(refusalOf(() => readStartRequest({
      client_name: 'x',
      boards: [{ boardId: 'b', scopes: ['boards:read'] }, { boardId: 'b', scopes: ['boards:read'] }]
    })).message, /listed twice/)
  })

  test('a permission that is not known, or none at all, is refused', () => {
    assert.match(refusalOf(() => readStartRequest({ client_name: 'x', boards: [{ boardId: 'b', scopes: ['root'] }] })).message, /not known/)
    assert.match(refusalOf(() => readStartRequest({ client_name: 'x', boards: [{ boardId: 'b', scopes: [] }] })).message, /at least one permission/)
  })

  test('a name longer than 60 characters is refused', () => {
    const long = 'x'.repeat(61)
    assert.match(refusalOf(() => readStartRequest({ client_name: long, boards: [{ boardId: 'b', scopes: ['boards:read'] }] })).message, /limited to 60/)
  })
})

describe('what the person approves', () => {
  const requested = [
    { boardId: 'b1', scopes: ['boards:read', 'boards:write'] as const },
    { boardId: 'b2', scopes: ['boards:read'] as const }
  ]

  test('the person may take a permission away, and keeps only what they pick', () => {
    const grant = narrowGrant([...requested], [{ boardId: 'b1', scopes: ['boards:read'] }])
    assert.deepEqual(grant, [{ boardId: 'b1', scopes: ['boards:read'] }])
  })

  test('a board the request did not ask for is refused: approval never widens', () => {
    assert.match(refusalOf(() => narrowGrant([...requested], [{ boardId: 'other', scopes: ['boards:read'] }])).message, /did not ask for one of the boards/)
  })

  test('a permission the request did not ask for on that board is refused', () => {
    assert.match(refusalOf(() => narrowGrant([...requested], [{ boardId: 'b2', scopes: ['boards:write'] }])).message, /did not ask for one of the permissions/)
  })

  test('an empty pick is refused: the person denies the request instead', () => {
    assert.match(refusalOf(() => narrowGrant([...requested], [])).message, /Keep at least one board/)
    assert.match(refusalOf(() => narrowGrant([...requested], 'b1')).message, /Keep at least one board/)
  })
})

describe('the poll', () => {
  test('a poll sooner than the interval is slowed down, and the first poll is not', () => {
    const now = Date.UTC(2026, 10, 7, 22, 0, 0)
    assert.equal(isPollTooSoon(null, now), false)
    assert.equal(isPollTooSoon(now - (DEVICE_POLL_INTERVAL_SECONDS * 1000 - 1), now), true)
    assert.equal(isPollTooSoon(now - DEVICE_POLL_INTERVAL_SECONDS * 1000, now), false)
  })

  test('slow_down is a 429 with the code and a longer interval, and says how long to wait', () => {
    const refusal = errorOf(() => slowDown())
    assert.equal(refusal.statusCode, 429)
    assert.equal(refusal.data?.code, 'slow_down')
    assert.ok((refusal.data?.interval ?? 0) > DEVICE_POLL_INTERVAL_SECONDS)
    assert.match(refusal.message, /wait at least 5 seconds/)
  })

  test('a request past its expiry is expired, and one before it is not', () => {
    const now = 1_000_000
    assert.equal(isDeviceRequestExpired(now, now), true)
    assert.equal(isDeviceRequestExpired(now + 1, now), false)
  })
})

describe('the messages an agent is given', () => {
  test('each refusal has its code, and the sentence for the user first', () => {
    const expired = errorOf(() => deviceRefusal('device_expired'))
    assert.equal(expired.statusCode, 401)
    assert.equal(expired.data?.code, 'device_expired')
    assert.equal(expired.message, DEVICE_REFUSAL_MESSAGES.device_expired)
  })

  test('denied, expired and used refusals all carry the agent-passing line and do not retry', () => {
    for (const code of ['device_expired', 'device_denied', 'device_consumed'] as const) {
      const message = DEVICE_REFUSAL_MESSAGES[code]
      assert.match(message, /If you are an agent or subagent, pass this along to your main agent/)
      assert.match(message, /Do not retry/)
    }
  })

  test('an unknown device code gets the plain 401, and no hint about other requests', () => {
    const refusal = errorOf(() => unknownDeviceCode())
    assert.equal(refusal.statusCode, 401)
    assert.equal(refusal.message, 'Invalid device code')
    assert.equal(refusal.data, undefined)
  })
})
