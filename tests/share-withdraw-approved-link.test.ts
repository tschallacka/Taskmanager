// Withdraw takes back every link shown for that address (card mwkj1emrzul690foku). The approved or resent link under "Who has access"
// (approvedLink) stayed on the dialog after its invitation was withdrawn (reproduced: Resend, then Withdraw). The link box (lastInvite)
// is cleared when it holds that invitation or that address. Source level: it reads BoardShare.vue.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

function withdrawBody(): string {
  const start = source.indexOf('function withdraw(invitation: Invitation)')
  assert.ok(start >= 0, 'withdraw is in the dialog')
  return source.slice(start, source.indexOf('\n}\n', start) + 3)
}

test('withdraw clears the approved or resent link when it is for the withdrawn address', () => {
  const body = withdrawBody()
  assert.match(body, /approvedLink\.value\?\.email === invitation\.email/, 'the address decides')
  assert.match(body, /approvedLink\.value = null/)
})

test('withdraw clears the link box when it is for the withdrawn invitation or its address', () => {
  const body = withdrawBody()
  assert.match(body, /lastInvite\.value\?\.id === invitation\.id \|\| lastInvite\.value\?\.email === invitation\.email/)
  assert.match(body, /lastInvite\.value = null/)
})
