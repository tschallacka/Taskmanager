// A link that was already used, opened again: the account that accepted it goes to its projects; anyone else sees the
// message with a button (sign in, or go to my projects). Pure: no database, no page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usedInvitePlan } from '../app/utils/usedInvite'

test('the account that accepted the link is sent to its projects', () => {
  assert.deepEqual(usedInvitePlan({ signedIn: true, acceptedByYou: true }), { redirectTo: '/projects', button: null })
})

test('a signed-in account that did not accept it gets a button to its projects', () => {
  assert.deepEqual(usedInvitePlan({ signedIn: true, acceptedByYou: false }), {
    redirectTo: null,
    button: { label: 'Go to my projects', to: '/projects' }
  })
})

test('no account signed in gets a sign-in button', () => {
  assert.deepEqual(usedInvitePlan({ signedIn: false, acceptedByYou: false }), {
    redirectTo: null,
    button: { label: 'Sign in', to: '/login' }
  })
})
