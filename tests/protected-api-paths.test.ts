// Which API paths need a session. A route that is not on this list gets no session in its context, so a route that
// reads the session on it fails. /api/shared-with-me reads it: it has to be on the list. Pure. Run:
//   node --import tsx --test tests/protected-api-paths.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isProtectedApiPath } from '../server/utils/protectedApi'

test('the shared-with-me list needs a session', () => {
  assert.equal(isProtectedApiPath('/api/shared-with-me'), true)
})

test('the pending-invitations list needs a session', () => {
  assert.equal(isProtectedApiPath('/api/pending-invitations'), true)
})

test('the invitation links stay open before sign-in', () => {
  assert.equal(isProtectedApiPath('/api/invitations/abc'), false)
  assert.equal(isProtectedApiPath('/api/invitations/abc/accept'), false)
})

test('an existing protected route is still protected', () => {
  assert.equal(isProtectedApiPath('/api/projects/p1'), true)
  assert.equal(isProtectedApiPath('/api/settings'), true)
})

test('a path that only starts like a protected one is not protected', () => {
  assert.equal(isProtectedApiPath('/api/settingsx'), true, 'prefix match, as the middleware has always done')
  assert.equal(isProtectedApiPath('/api/health'), false)
})
