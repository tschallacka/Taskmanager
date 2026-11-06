// The extra email addresses panel: the add form is offered only when the instance can send the confirmation
// mail, and the confirm page links to the panel. Pure functions, no browser. Run:
//   node --import tsx --test tests/extra-email-panel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXTRA_EMAILS_ANCHOR, EXTRA_EMAILS_LINK, NO_MAIL_NOTICE, canAddExtraEmail } from '../app/utils/extraEmailPanel'

test('the add form is offered only once the server says mail can be sent', () => {
  assert.equal(canAddExtraEmail(true), true)
  assert.equal(canAddExtraEmail(false), false)
  assert.equal(canAddExtraEmail(null), false, 'nothing is offered before the server has answered')
})

test('the notice says plainly that this instance cannot send mail', () => {
  assert.match(NO_MAIL_NOTICE, /cannot send mail/)
})

test('the confirm page link lands on the panel on Settings', () => {
  assert.equal(EXTRA_EMAILS_LINK, `/settings#${EXTRA_EMAILS_ANCHOR}`)
  assert.equal(EXTRA_EMAILS_LINK, '/settings#extra-emails', 'the panel root carries this id')
})
