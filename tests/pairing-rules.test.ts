// The rules of a pairing code that need no database: the code format, the digest it is stored under, the
// refusals, and the rate limit on the exchange. Run:
//   node --import tsx --test tests/pairing-rules.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAIRING_REFUSAL_MESSAGES,
  createAttemptLimiter,
  generatePairingCode,
  isPairingCodeExpired,
  pairingCodeDigest,
  pairingRefusal,
  pairingSummary,
  unknownPairingCode
} from '../server/utils/pairing'

const AGENT_LINE = 'If you are an agent or subagent, pass this along to your main agent so they can ask the user for a new pairing code. Do not retry with this code.'

describe('the code', () => {
  test('a new code is tm-pair-XXXX-XXXX with no look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePairingCode()
      assert.match(code, /^tm-pair-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
    }
  })

  test('two new codes are not the same', () => {
    assert.notEqual(generatePairingCode(), generatePairingCode())
  })

  test('the same code gives the same digest whatever the case, spacing and hyphens', () => {
    const digest = pairingCodeDigest('tm-pair-7QK2-M9XD')
    assert.ok(digest)
    assert.equal(pairingCodeDigest('TM-PAIR-7QK2-M9XD'), digest)
    assert.equal(pairingCodeDigest('  tm-pair-7qk2m9xd '), digest)
    assert.equal(pairingCodeDigest('7QK2M9XD'), digest)
  })

  test('the digest is not the code itself', () => {
    const digest = pairingCodeDigest('tm-pair-7QK2-M9XD')!
    assert.equal(digest.length, 64)
    assert.ok(!digest.includes('7QK2'))
  })

  test('text that cannot be a code gives no digest', () => {
    assert.equal(pairingCodeDigest(undefined), null)
    assert.equal(pairingCodeDigest(42), null)
    assert.equal(pairingCodeDigest(''), null)
    assert.equal(pairingCodeDigest('tm-pair-7QK2-M9X'), null)
    assert.equal(pairingCodeDigest('tm-pair-7QK2-M9XDD'), null)
    assert.equal(pairingCodeDigest('tm-pair-0QK2-M9XD'), null, 'zero is not in the alphabet')
    assert.equal(pairingCodeDigest('tm-pair-1QK2-M9XD'), null, 'one is not in the alphabet')
  })
})

describe('the expiry', () => {
  test('a code is expired at and after its expiry time, not before', () => {
    assert.equal(isPairingCodeExpired(1_000, 999), false)
    assert.equal(isPairingCodeExpired(1_000, 1_000), true)
    assert.equal(isPairingCodeExpired(1_000, 1_001), true)
  })
})

describe('the refusals', () => {
  test('a used or expired code says so, in plain text, with the line for the main agent', () => {
    for (const message of Object.values(PAIRING_REFUSAL_MESSAGES)) {
      assert.ok(message.endsWith(AGENT_LINE), message)
    }
    assert.match(PAIRING_REFUSAL_MESSAGES.pairing_code_used, /^This pairing code has already been used\./)
    assert.match(PAIRING_REFUSAL_MESSAGES.pairing_code_expired, /^This pairing code has expired\. Pairing codes last 10 minutes\./)
  })

  test('a used or expired code is a 401 that carries its stable code', () => {
    for (const code of ['pairing_code_used', 'pairing_code_expired'] as const) {
      const refusal = pairingRefusal(code) as unknown as { statusCode: number, message: string, data: { code: string } }
      assert.equal(refusal.statusCode, 401)
      assert.equal(refusal.data.code, code)
      assert.equal(refusal.message, PAIRING_REFUSAL_MESSAGES[code])
    }
  })

  test('an unknown code is the plain 401, with no code name and no hint', () => {
    const refusal = unknownPairingCode() as unknown as { statusCode: number, message: string, data?: unknown }
    assert.equal(refusal.statusCode, 401)
    assert.equal(refusal.message, 'Invalid pairing code')
    assert.equal(refusal.data, undefined)
  })
})

describe('the exchange rate limit', () => {
  test('attempts within the limit pass, the one after it does not', () => {
    const limiter = createAttemptLimiter(3, 1_000)
    assert.equal(limiter.allow('a', 0), true)
    assert.equal(limiter.allow('a', 1), true)
    assert.equal(limiter.allow('a', 2), true)
    assert.equal(limiter.allow('a', 3), false)
  })

  test('the limit is per address', () => {
    const limiter = createAttemptLimiter(1, 1_000)
    assert.equal(limiter.allow('a', 0), true)
    assert.equal(limiter.allow('b', 0), true)
    assert.equal(limiter.allow('a', 0), false)
  })

  test('the window slides: an attempt counts for its window only', () => {
    const limiter = createAttemptLimiter(1, 1_000)
    assert.equal(limiter.allow('a', 0), true)
    assert.equal(limiter.allow('a', 999), false)
    assert.equal(limiter.allow('a', 1_000), true)
  })
})

describe('the summary kept with a code', () => {
  test('holds the address and the user agent, and is kept short', () => {
    assert.equal(pairingSummary('10.0.0.2', 'claude-code/1.0'), '10.0.0.2 claude-code/1.0')
    assert.equal(pairingSummary(undefined, undefined), 'unknown address unknown client')
    assert.equal(pairingSummary('10.0.0.2', 'x'.repeat(1_000)).length, 300)
  })
})
