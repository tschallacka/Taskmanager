// The instance admin's pages share one shell with a left list (redesign 8/9, the Admin part of the Do list): Instance
// settings and Crews, each on its own address. The Accounts list is a modal on Instance settings, not a page, so it is not
// in the list. Source level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/admin-settings-shell.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ADMIN_SECTIONS } from '../app/utils/adminSections'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the admin sections have their own addresses', () => {
  const paths = ADMIN_SECTIONS.map(section => section.path)
  assert.deepEqual(paths, ['/admin/accounts', '/admin/crews', '/admin/settings'])
  assert.deepEqual(ADMIN_SECTIONS.map(section => section.label), ['Accounts', 'Crews', 'Instance settings'])
})

test('the admin shell builds its left list from the admin section table', () => {
  const shell = read('app/components/admin/Shell.vue')
  assert.match(shell, /ADMIN_SECTIONS/)
  assert.match(shell, /aria-label="Admin sections"/)
  assert.match(shell, /<slot/)
})

test('both admin pages sit in the admin shell', () => {
  assert.match(read('app/pages/admin/settings.vue'), /<AdminShell>/)
  assert.match(read('app/pages/admin/crews/index.vue'), /<AdminShell>/)
})
