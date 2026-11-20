// The legal pages are public (Quincy's QA on 5318cad): a signed-out visitor reads /privacy, /imprint and their archives
// without being sent to /login. The middleware's public paths include them, and the rule is one function. Pure. Run:
//   node --import tsx --test tests/public-legal-paths.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPublicPagePath } from '../shared/utils/publicPaths'

test('the legal pages and their archives are public', () => {
  for (const path of ['/privacy', '/privacy/', '/privacy/archive', '/privacy/archive/1.0.0', '/imprint', '/imprint/archive', '/imprint/archive/1.0.0']) {
    assert.equal(isPublicPagePath(path), true, path)
  }
})

test('the existing public pages stay public', () => {
  for (const path of ['/login', '/public/project/abc', '/invite/token', '/confirm-email/x']) {
    assert.equal(isPublicPagePath(path), true, path)
  }
})

test('the rest is not public, and a longer name does not match by prefix', () => {
  for (const path of ['/projects', '/settings', '/privacyx', '/imprints', '/privacy-settings', '/team']) {
    assert.equal(isPublicPagePath(path), false, path)
  }
})

test('the middleware uses this rule for its public paths', () => {
  const middleware = readFileSync(join(import.meta.dirname, '..', 'app', 'middleware', 'auth.global.ts'), 'utf8')
  assert.match(middleware, /isPublicPagePath\(to\.path\)/)
})
