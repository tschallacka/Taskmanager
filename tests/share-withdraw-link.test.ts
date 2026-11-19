// Withdraw on a pending guest clears the link box that belongs to it (Usher's item: the old link box stayed on the dialog
// after the invitation was withdrawn). Source level: the withdraw handler clears the box when the ids match.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

test('withdrawing a pending guest clears the link box when it is that invitation', () => {
  const start = source.indexOf('function withdraw(invitation: Invitation)')
  assert.ok(start >= 0, 'withdraw is not in the dialog')
  const body = source.slice(start, source.indexOf('\n}\n', start) + 3)
  assert.match(body, /lastInvite\.value\?\.id === invitation\.id/)
  assert.match(body, /lastInvite\.value = null/)
})
