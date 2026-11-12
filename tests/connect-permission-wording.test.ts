// The approval page's wording for crews:manage (card mwdd5q94mmq78py1ntp): one plain sentence the owner can read. Pure.
// Run: node --import tsx --test tests/connect-permission-wording.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONNECT_PERMISSIONS, permissionName } from '../app/utils/connectPrompt'

test('crews:manage reads as a plain sentence about making a crew for this board', () => {
  assert.equal(permissionName('crews:manage'), 'Let this agent make a crew for this board')
  const entry = CONNECT_PERMISSIONS.find(item => item.scope === 'crews:manage')
  assert.match(entry?.description ?? '', /its own accounts and keys/)
  assert.match(entry?.description ?? '', /Only the instance admin can give this/)
})
