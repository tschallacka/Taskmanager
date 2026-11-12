// The Settings Account block for your own picture and name (source level): the editor is in the block, it calls the picture
// and name routes, the picture is cropped to 256 px in the browser, and the session refresh is exported and used.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the editor is in the Settings Account block and the old avatar is gone from its row', () => {
  const settings = read('app/pages/settings/index.vue')
  assert.match(settings, /<AccountProfileEditor/)
  const account = settings.slice(settings.indexOf('id="account"'), settings.indexOf('<!-- Passkeys and two-factor -->'))
  assert.doesNotMatch(account, /<UAvatar/, 'the row no longer shows the old avatar')
  assert.match(settings, /@changed="refreshSession\(\)"/)
})

test('the editor calls the picture routes and the name route, and crops the picture to 256 px in the browser', () => {
  const editor = read('app/components/account/ProfileEditor.vue')
  assert.match(editor, /\$fetch\('\/api\/account\/avatar', \{ method: 'POST', body \}\)/)
  assert.match(editor, /\$fetch\('\/api\/account\/avatar', \{ method: 'DELETE' \}\)/)
  assert.match(editor, /\$fetch\('\/api\/account\/name', \{ method: 'PUT'/)
  assert.match(editor, /canvas\.width = 256/)
  assert.match(editor, /file\.type === 'image\/svg\+xml' \? file :/, 'an SVG is sent as it is')
  assert.match(editor, /if \(length > 60\)/, 'the name is 1 to 60 characters, as the server checks it')
})

test('the session refresh is exported by useAuth and signals the session to re-read', () => {
  const auth = read('app/composables/useAuth.ts')
  assert.match(auth, /function refreshSession\(\)/)
  assert.match(auth, /\$store\.notify\('\$sessionSignal'\)/)
  assert.match(auth, /return \{\s*session,\s*refreshSession,/)
})
