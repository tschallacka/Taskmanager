// Each account settings section opens on its own URL (redesign 8/9, step C): every section's address has its own page,
// each page is the shell with that section, and the left list is built from the section table. Source level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/settings-section-pages.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ACCOUNT_SECTIONS, SECTION_COMPONENTS } from '../app/utils/settingsSections'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// /settings is pages/settings/index.vue; /settings/account is pages/settings/account.vue.
function pageFileFor(path: string): string {
  const last = path.replace(/^\/settings\/?/, '')
  return last === '' ? 'app/pages/settings/index.vue' : `app/pages/settings/${last}.vue`
}

test('every section address has its own page file', () => {
  for (const section of ACCOUNT_SECTIONS) {
    assert.ok(existsSync(new URL(`../${pageFileFor(section.path)}`, import.meta.url)), `${section.path} has no page`)
  }
})

test('each section page is the shell with its section component', () => {
  for (const section of ACCOUNT_SECTIONS) {
    const page = read(pageFileFor(section.path))
    assert.match(page, /<SettingsShell/, `${section.path} is not in the shell`)
    assert.match(page, new RegExp(`<${SECTION_COMPONENTS[section.key]}\\b`), `${section.path} does not show ${SECTION_COMPONENTS[section.key]}`)
  }
})

test('the shell builds its left list from the section table, not from hash links', () => {
  const shell = read('app/components/settings/Shell.vue')
  assert.match(shell, /ACCOUNT_SECTIONS/)
  assert.equal(shell.includes('to: \'#'), false)
  assert.match(shell, /aria-label="Settings sections"/)
})

test('an old hash link (/settings#account) moves to its own address', () => {
  const stats = read('app/pages/settings/index.vue')
  assert.match(stats, /sectionPathForHash/)
})

test('the security and email panels are sections on their own addresses, not on the account page', () => {
  // Quincy's QA (mwc4jn0gozwdfd89e3): Security and Email get their own addresses (see settings-account-subsections).
  const account = read('app/pages/settings/account.vue')
  assert.equal(account.includes('<SecurityPanel'), false)
  assert.equal(account.includes('<EmailPrivacyPanel'), false)
})
