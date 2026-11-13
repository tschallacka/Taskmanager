// The picture store (server/utils/avatarStore.ts) and its serving route, run as a handler: only a stored name is served,
// and the content type follows the extension. The route's refusals are tested by calling it; an SVG served under the
// restrictive policy needs a stored file, so that header is not covered here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createError, getRouterParam, setHeader } from 'h3'
import { AVATAR_EXT, contentTypeOf, safeAvatarName } from '../server/utils/avatarStore'

// Nitro provides these as globals; the route file uses them without importing.
Object.assign(globalThis, {
  createError,
  getRouterParam,
  setHeader,
  defineEventHandler: (fn: unknown) => fn
})

const pictureRoute = (await import('../server/api/account/avatars/[userId]/[filename].get.ts')).default as (event: unknown) => unknown

function requestFor(userId: string, filename: string) {
  const res = {
    setHeader: () => undefined,
    getHeader: () => undefined
  }
  return { context: { params: { userId, filename } }, node: { req: { headers: {} }, res } }
}

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

test('the picture route refuses a name that is not a stored picture name, with 404', async () => {
  for (const filename of ['../../etc/passwd', '0123456789abcdef01234567.exe', 'picture.png']) {
    await assert.rejects(Promise.resolve().then(() => pictureRoute(requestFor('user-a', filename))), (error: { statusCode?: number }) => {
      assert.equal(error.statusCode, 404, filename)
      return true
    })
  }
})

test('the picture route refuses a user id with characters a folder name may not have, with 404', async () => {
  await assert.rejects(Promise.resolve().then(() => pictureRoute(requestFor('../other', '0123456789abcdef01234567.png'))), (error: { statusCode?: number }) => {
    assert.equal(error.statusCode, 404)
    return true
  })
})

test('the picture route refuses a stored name that is not on disk, with 404', async () => {
  await assert.rejects(Promise.resolve().then(() => pictureRoute(requestFor('user-nobody-here', '0123456789abcdef01234567.png'))), (error: { statusCode?: number }) => {
    assert.equal(error.statusCode, 404)
    return true
  })
})
