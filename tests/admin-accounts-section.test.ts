// Accounts is an instance admin section on its own address (Quincy's QA of redesign 8/9, mwc4jn0gozwdfd89e3). The list
// is one panel, shown on the page and in the modal that Instance settings still opens. Source level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/admin-accounts-section.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ADMIN_SECTIONS } from '../app/utils/adminSections'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Accounts is an admin section with its own address', () => {
  const accounts = ADMIN_SECTIONS.find(section => section.key === 'accounts')
  assert.equal(accounts?.path, '/admin/accounts')
  assert.equal(accounts?.label, 'Accounts')
})

test('the accounts page is in the admin shell, with the instance-admin middleware and the panel', () => {
  assert.ok(existsSync(new URL('../app/pages/admin/accounts.vue', import.meta.url)))
  const page = read('app/pages/admin/accounts.vue')
  assert.match(page, /<AdminShell>/)
  assert.match(page, /<AdminAccountsPanel/)
  assert.match(page, /middleware: 'instance-admin'/)
})

test('the panel holds the list and the search, and the modal shows the same panel', () => {
  const panel = read('app/components/AdminAccountsPanel.vue')
  assert.match(panel, /\/api\/admin\/users/)
  assert.match(panel, /data-testid="admin-users-search"/)
  assert.match(panel, /can create organisations/i)
  assert.match(read('app/components/AdminUsersModal.vue'), /<AdminAccountsPanel/)
})
