// The picture store (server/utils/avatarStore.ts) and its serving route, run as a handler: only a stored name is served,
// the content type follows the extension, an SVG is served under the restrictive policy, and the route's refusals are
// answered with 404. The SVG test stores a real file under the store (a throwaway user folder, removed after).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createError, getRouterParam, setHeader } from 'h3'
import { AVATAR_EXT, avatarDir, contentTypeOf, safeAvatarName } from '../server/utils/avatarStore'

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

test('an SVG picture is served as an image under the restrictive policy, with its bytes', async () => {
  const userId = `svg-test-${randomBytes(4).toString('hex')}`
  const dir = avatarDir(userId)
  const name = `${randomBytes(12).toString('hex')}.svg`
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>')
  const sent = new Map<string, string>()
  const res = {
    setHeader: (key: string, value: string) => {
      sent.set(key.toLowerCase(), value)
    },
    getHeader: () => undefined
  }
  try {
    const body = await pictureRoute({ context: { params: { userId, filename: name } }, node: { req: { headers: {} }, res } })
    assert.equal(sent.get('content-type'), 'image/svg+xml')
    assert.equal(sent.get('content-security-policy'), 'default-src \'none\'; style-src \'unsafe-inline\'; img-src data:')
    assert.match(String(body), /<svg/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(existsSync(join(dir, name)), false, 'the throwaway file is removed')
})

test('the picture route refuses a stored name that is not on disk, with 404', async () => {
  await assert.rejects(Promise.resolve().then(() => pictureRoute(requestFor('user-nobody-here', '0123456789abcdef01234567.png'))), (error: { statusCode?: number }) => {
    assert.equal(error.statusCode, 404)
    return true
  })
})
