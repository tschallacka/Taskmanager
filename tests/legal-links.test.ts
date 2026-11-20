// The Privacy and Imprint links (card mwidrtw6jigffzbe5, subtask 3): one component draws them, and the login page, the
// invitation page and the settings page show it. The sign-up form says "By continuing you accept the Privacy Policy",
// with the link. Source-level. Run:
//   node --import tsx --test tests/legal-links.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8')

// The links themselves (their targets and labels) come from shared/utils/legalLinks.ts, and only published ones show
// (legal-links-published.test.ts).
test('one component draws the Privacy and Imprint links from the shared rule', () => {
  const links = read('app/components/LegalLinks.vue')
  assert.match(links, /legalLinksToShow\(/)
  const rule = read('shared/utils/legalLinks.ts')
  assert.match(rule, /to: '\/privacy'/)
  assert.match(rule, /to: '\/imprint'/)
  assert.match(rule, /label: 'Privacy'/)
  assert.match(rule, /label: 'Imprint'/)
})

test('the login page shows the links, and the sign-up form says what signing up accepts, with the link', () => {
  const login = read('app/pages/login.vue')
  assert.match(login, /<LegalLinks \/>/)
  assert.match(login, /By continuing you accept the/)
  assert.match(login, /Privacy Policy/)
  // The consent is in the sign-up form only, and only while the Privacy Policy is published.
  assert.match(login, /v-if="mode === 'sign-up' && privacyPublished"[\s\S]{0,200}By continuing you accept the/)
})

test('the invitation page shows the links', () => {
  assert.match(read('app/pages/invite/[token].vue'), /<LegalLinks \/>/)
})

test('the settings page shows the links', () => {
  assert.match(read('app/pages/settings/index.vue'), /<LegalLinks \/>/)
})
