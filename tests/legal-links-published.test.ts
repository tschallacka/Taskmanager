// A footer link to a legal page is shown only when that page answers (card mwidrtw6jigffzbe5, the pre-gate check): a
// draft's page is 404, so a link to it would be a bug. Pure rule, plus a source check that the components use it. Run:
//   node --import tsx --test tests/legal-links-published.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { legalLinksToShow, privacyConsentToShow } from '../shared/utils/legalLinks'

const root = join(import.meta.dirname, '..')

test('a draft privacy policy and a draft imprint: no link at all', () => {
  assert.deepEqual(legalLinksToShow({ privacy: false, imprint: false }), [])
})

test('a published privacy policy: the Privacy link, and only that one', () => {
  assert.deepEqual(legalLinksToShow({ privacy: true, imprint: false }), [{ name: 'privacy', label: 'Privacy', to: '/privacy' }])
})

test('a published imprint: the Imprint link, and only that one', () => {
  assert.deepEqual(legalLinksToShow({ privacy: false, imprint: true }), [{ name: 'imprint', label: 'Imprint', to: '/imprint' }])
})

test('both published: both links, in order', () => {
  assert.deepEqual(legalLinksToShow({ privacy: true, imprint: true }).map(link => link.name), ['privacy', 'imprint'])
})

test('the sign-up consent names the Privacy Policy only while it is published', () => {
  assert.equal(privacyConsentToShow({ privacy: false, imprint: true }), false)
  assert.equal(privacyConsentToShow({ privacy: true, imprint: false }), true)
})

test('the footer and the sign-up form both read the published state, not a fixed link', () => {
  const links = readFileSync(join(root, 'app/components/LegalLinks.vue'), 'utf8')
  assert.match(links, /useLegalPublished\(\)/)
  assert.match(links, /legalLinksToShow\(/)
  const login = readFileSync(join(root, 'app/pages/login.vue'), 'utf8')
  assert.match(login, /v-if="mode === 'sign-up' && privacyPublished"/)
  assert.match(login, /useLegalPublished\(\)/)
})
