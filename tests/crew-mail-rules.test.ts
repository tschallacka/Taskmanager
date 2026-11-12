// The crew mail rules that need no database: an id is 32 lowercase hex, a text is 1 to 4096 bytes, a recipient is a crew
// member (not a customer or contact), and the keep times are 7 days delivered and 30 days undelivered.
//   node --import tsx --test tests/crew-mail-rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMailMemberKey, mailCutoffs, mailIdProblem, mailTextProblem, MAIL_TEXT_MAX_BYTES } from '../server/utils/crewMailRules'

const teams: Record<string, string> = { boss: 'admin', pia: 'member', wick: 'member', customer: 'contact', contact: 'contact' }
const teamOf = (key: string) => teams[key]

test('an id is 32 lowercase hex and anything else is refused', () => {
  assert.equal(mailIdProblem('0123456789abcdef0123456789abcdef'), null)
  assert.notEqual(mailIdProblem('0123456789ABCDEF0123456789abcdef'), null)
  assert.notEqual(mailIdProblem('short'), null)
  assert.notEqual(mailIdProblem(42), null)
  assert.notEqual(mailIdProblem(undefined), null)
})

test('a text is 1 to 4096 bytes in UTF-8, and refuses empty, too large or not a string', () => {
  assert.equal(mailTextProblem('hello'), null)
  assert.equal(mailTextProblem('x'.repeat(MAIL_TEXT_MAX_BYTES)), null)
  assert.notEqual(mailTextProblem('x'.repeat(MAIL_TEXT_MAX_BYTES + 1)), null)
  // 2049 two-byte characters are 4098 bytes: over the limit though the character count is under 4096.
  assert.notEqual(mailTextProblem('é'.repeat(2049)), null)
  assert.notEqual(mailTextProblem('   '), null)
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
