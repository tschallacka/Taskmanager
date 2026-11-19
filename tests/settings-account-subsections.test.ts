// Security and Email are account settings sections on their own addresses (Quincy's QA of redesign 8/9, mwc4jn0gozwdfd89e3).
// Source level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/settings-account-subsections.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ACCOUNT_SECTIONS, SECTION_COMPONENTS, sectionPathForHash } from '../app/utils/settingsSections'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Security and Email are sections, each on its own address', () => {
  const security = ACCOUNT_SECTIONS.find(section => section.key === 'security')
  const email = ACCOUNT_SECTIONS.find(section => section.key === 'email')
  assert.equal(security?.path, '/settings/security')
  assert.equal(security?.label, 'Security')
  assert.equal(email?.path, '/settings/email')
  assert.equal(email?.label, 'Email')
})

test('an old hash link to security or email goes to its own address', () => {
  assert.equal(sectionPathForHash('#security'), '/settings/security')
  assert.equal(sectionPathForHash('#email'), '/settings/email')
})

test('each new section has a page with the shell and its component, and a component file', () => {
  for (const [key, page] of [['security', 'app/pages/settings/security.vue'], ['email', 'app/pages/settings/email.vue']] as const) {
    assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), `${page} is missing`)
    const source = read(page)
    assert.match(source, /<SettingsShell/)
    assert.match(source, new RegExp(`<${SECTION_COMPONENTS[key]}\\b`))
    assert.ok(existsSync(new URL(`../app/components/settings/${SECTION_COMPONENTS[key].replace(/^Settings/, '')}.vue`, import.meta.url)))
  }
})

test('the security section shows the passkeys and two-factor panel, the email section the privacy panel', () => {
  assert.match(read('app/components/settings/Security.vue'), /<SecurityPanel/)
  assert.match(read('app/components/settings/Email.vue'), /<EmailPrivacyPanel/)
})
