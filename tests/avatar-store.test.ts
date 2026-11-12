// The picture store (server/utils/avatarStore.ts) and its routes: only a stored name is served, the content type follows the
// extension, an SVG is served under a restrictive policy, and the upload runs the shared checks before it writes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AVATAR_EXT, contentTypeOf, safeAvatarName } from '../server/utils/avatarStore'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('only a stored picture name is accepted: 24 hex characters and a known extension', () => {
  assert.deepEqual(safeAvatarName('0123456789abcdef01234567.png'), { ext: 'png' })
  assert.deepEqual(safeAvatarName('0123456789abcdef01234567.svg'), { ext: 'svg' })
  assert.equal(safeAvatarName('../../etc/passwd'), null)
  assert.equal(safeAvatarName('0123456789abcdef0123456.png'), null, 'one character short')
  assert.equal(safeAvatarName('0123456789abcdef01234567.exe'), null)
  assert.equal(safeAvatarName('0123456789ABCDEF01234567.png'), null, 'lower case only, as the store writes')
})

test('the content type follows the extension, and an unknown one is served as bytes', () => {
  assert.equal(contentTypeOf('png'), 'image/png')
  assert.equal(contentTypeOf('jpg'), 'image/jpeg')
  assert.equal(contentTypeOf('webp'), 'image/webp')
  assert.equal(contentTypeOf('svg'), 'image/svg+xml')
  assert.equal(contentTypeOf('html'), 'application/octet-stream')
  assert.deepEqual(Object.keys(AVATAR_EXT).sort(), ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'])
})

test('the upload runs the shared checks before it writes, and the stored name is random, never the client name', () => {
  const upload = read('server/api/account/avatar.post.ts')
  assert.match(upload, /uploadProblem\(\{ type, bytes: file\.data\.length \}\)/)
  assert.match(upload, /svgProblem\(file\.data\.toString\('utf8'\)\)/)
  assert.match(upload, /mayChangeProfile\(me, me\)/)
  assert.match(upload, /randomBytes\(12\)\.toString\('hex'\)/)
  assert.doesNotMatch(upload, /file\.filename/, 'the client file name is never used')
})

test('the picture route serves only a checked name, and an SVG under a restrictive policy', () => {
  const serve = read('server/api/account/avatars/[userId]/[filename].get.ts')
  assert.match(serve, /safeAvatarName\(filename\)/)
  assert.match(serve, /default-src 'none'/, 'an SVG cannot load or run anything')
})
