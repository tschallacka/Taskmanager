// Which form the login page opens in. An invitation link opens in sign-up unless the address says signin=1;
// without an invitation the page opens in sign-in, as before. Pure: no server. Run:
//   node --import tsx --test tests/login-mode.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loginMode } from '../app/utils/loginMode'

test('an invitation link with no mode opens in sign-up', () => {
  assert.equal(loginMode({ invite: 'tok', signup: undefined, signin: undefined }), 'sign-up')
})

test('an invitation link with signup=1 opens in sign-up, as before', () => {
  assert.equal(loginMode({ invite: 'tok', signup: '1', signin: undefined }), 'sign-up')
})

test('an invitation link with signin=1 opens in sign-in', () => {
  assert.equal(loginMode({ invite: 'tok', signup: undefined, signin: '1' }), 'sign-in')
})

test('when both are given, signin=1 wins: the person asked to sign in', () => {
  assert.equal(loginMode({ invite: 'tok', signup: '1', signin: '1' }), 'sign-in')
})

test('no invitation: sign-in, whatever the flags say', () => {
  assert.equal(loginMode({ invite: undefined, signup: undefined, signin: undefined }), 'sign-in')
  assert.equal(loginMode({ invite: undefined, signup: '1', signin: undefined }), 'sign-in')
  assert.equal(loginMode({ invite: '', signup: undefined, signin: undefined }), 'sign-in')
})
