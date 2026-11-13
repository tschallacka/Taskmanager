// The shared avatar component (app/components/UserAvatar.vue) takes its initials and colour from the one module. The display-
// name route is run as a handler in tests/avatar-routes.test.ts (its refusals, and that it goes through better-auth).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('the shared avatar component takes its initials and colour from the one module', () => {
  const component = readFileSync(new URL('../app/components/UserAvatar.vue', import.meta.url), 'utf8')
  assert.match(component, /from '~\/utils\/avatarInitials'/)
  assert.match(component, /data-user-avatar="initials"/)
  assert.match(component, /data-user-avatar="picture"/)
})
