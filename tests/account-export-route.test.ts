// The download route and its button (card mwjfpr8phz5gi4bdjqa). Source-level, no server: the route takes the person from the
// session, never from the request, sends the file as an attachment, and settings links to it. Run:
//   node --import tsx --test tests/account-export-route.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8')

test('the download route takes the person from the session and runs the exporter for them', () => {
  const route = read('server/api/account/export.get.ts')
  assert.match(route, /event\.context\.session\.user/)
  assert.match(route, /exportAccount\(me\.id\)/)
  assert.doesNotMatch(route, /getQuery|readBody|getRouterParam|getValidatedQuery/, 'the id never comes from the request')
})

test('the download route sends an attachment, never cached', () => {
  const route = read('server/api/account/export.get.ts')
  assert.match(route, /Content-Disposition['"]?,\s*['"]attachment; filename=/)
  assert.match(route, /Cache-Control['"]?,\s*['"]no-store['"]/)
  assert.match(route, /application\/json/)
})

test('settings offers "Download my data" as a link to the route, with the download attribute', () => {
  const settings = read('app/pages/settings/index.vue')
  assert.match(settings, /Download my data/)
  assert.match(settings, /href="\/api\/account\/export"/)
  assert.match(settings, /<a[^>]*href="\/api\/account\/export"[^>]*download/)
})
