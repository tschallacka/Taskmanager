// The display-name route (server/api/account/name.put.ts): only the signed-in person's own name, checked by the tested rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../server/api/account/name.put.ts', import.meta.url), 'utf8')

test('the name route checks that the change is the person\'s own, and the name by the shared rules', () => {
  assert.match(route, /mayChangeProfile\(me, target\)/)
  assert.match(route, /displayNameOf\(body\?\.name\)/)
  assert.match(route, /statusCode: 403/)
})

test('the name route writes only the signed-in person\'s row', () => {
  assert.match(route, /\.where\(eq\(user\.id, me\)\)/)
  assert.doesNotMatch(route, /\.where\(eq\(user\.id, target\)\)/)
})

test('the shared avatar component takes its initials and colour from the one module', () => {
  const component = readFileSync(new URL('../app/components/UserAvatar.vue', import.meta.url), 'utf8')
  assert.match(component, /from '~\/utils\/avatarInitials'/)
  assert.match(component, /data-user-avatar="initials"/)
  assert.match(component, /data-user-avatar="picture"/)
})
