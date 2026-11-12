// The crew mail rules that need no database: an id is 32 lowercase hex, a text is 1 byte to 1 MB (the one safety stop, with
// no other cap), a recipient is a crew member (not a customer or contact), and the keep times are 7 and 30 days.
//   node --import tsx --test tests/crew-mail-rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMailMemberKey, mailCutoffs, mailIdProblem, mailTextProblem, MAIL_TEXT_SAFETY_BYTES } from '../server/utils/crewMailRules'

const teams: Record<string, string> = { boss: 'admin', pia: 'member', wick: 'member', customer: 'contact', contact: 'contact' }
const teamOf = (key: string) => teams[key]

test('an id is 32 lowercase hex and anything else is refused', () => {
  assert.equal(mailIdProblem('0123456789abcdef0123456789abcdef'), null)
  assert.notEqual(mailIdProblem('0123456789ABCDEF0123456789abcdef'), null)
  assert.notEqual(mailIdProblem('short'), null)
  assert.notEqual(mailIdProblem(42), null)
  assert.notEqual(mailIdProblem(undefined), null)
})

test('a text of any size up to the 1 MB safety stop is valid; a 100 KB text is valid', () => {
  assert.equal(mailTextProblem('hello'), null)
  assert.equal(mailTextProblem('x'.repeat(100 * 1024)), null)
  assert.equal(mailTextProblem('x'.repeat(MAIL_TEXT_SAFETY_BYTES)), null)
})

test('over the 1 MB safety stop the problem says the size, and nothing is cut', () => {
  const problem = mailTextProblem('x'.repeat(MAIL_TEXT_SAFETY_BYTES + 1))
  assert.notEqual(problem, null)
  assert.match(problem as string, new RegExp(`${MAIL_TEXT_SAFETY_BYTES + 1} bytes`))
  assert.match(problem as string, /1 MB/)
  // 600,000 two-byte characters are 1,200,000 bytes: over the stop, though the character count is under 1 MB.
  assert.notEqual(mailTextProblem('é'.repeat(600_000)), null)
})

test('an empty, blank or non-string text is refused', () => {
  assert.notEqual(mailTextProblem('   '), null)
  assert.notEqual(mailTextProblem(''), null)
  assert.notEqual(mailTextProblem(7), null)
})

test('a recipient or sender is a crew member key: admin or member team, never a customer, a contact or an unknown key', () => {
  assert.equal(isMailMemberKey('boss', teamOf), true)
  assert.equal(isMailMemberKey('pia', teamOf), true)
  assert.equal(isMailMemberKey('customer', teamOf), false)
  assert.equal(isMailMemberKey('contact', teamOf), false)
  assert.equal(isMailMemberKey('nobody', teamOf), false)
  assert.equal(isMailMemberKey('', teamOf), false)
})

test('delivered mail is kept 7 days and undelivered mail 30 days', () => {
  const day = 86400_000
  const cut = mailCutoffs(1_000_000_000_000)
  assert.equal(cut.deliveredBefore, 1_000_000_000_000 - 7 * day)
  assert.equal(cut.undeliveredBefore, 1_000_000_000_000 - 30 * day)
})
