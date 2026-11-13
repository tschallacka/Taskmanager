// The profile routes run as handlers, not read as text: the picture upload (server/api/account/avatar.post.ts) and the
// display-name change (server/api/account/name.put.ts). Only their refusal paths run here, each before any database write,
// so no database is reached: the size is refused before the body is read, the type after it, and another person's name
// or an empty name before the better-auth update. The accepted paths write through the database and are covered by the
// shots taken on the production build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createError, createEvent, getHeader, readBody, readMultipartFormData } from 'h3'

// Nitro provides these as globals; the route files use them without importing.
Object.assign(globalThis, {
  createError,
  getHeader,
  readBody,
  readMultipartFormData,
  defineEventHandler: (fn: unknown) => fn
})
// Set before the routes load: they import the database module, which reads this at load and is never used here.
process.env.DATABASE_URL ??= 'postgresql://arnotes:arnotes@127.0.0.1:1/unused'
process.env.BETTER_AUTH_SECRET ??= 'avatar-routes-test-secret-0123456789abcdef'

const uploadHandler = (await import('../server/api/account/avatar.post.ts')).default as (event: unknown) => Promise<unknown>
const nameHandler = (await import('../server/api/account/name.put.ts')).default as (event: unknown) => Promise<unknown>

/** An event for a route as a signed-in person, with a request whose unread body is visible to the test. */
function requestAs(user: string, headers: Record<string, string>, body: Buffer) {
  const req = new Readable({ read() {} })
  req.push(body)
  req.push(null)
  Object.assign(req, { method: 'POST', url: '/api', headers })
  const event = createEvent(req as never, {} as never)
  ;(event as unknown as { context: Record<string, unknown> }).context.session = { user: { id: user } }
  return { event, req }
}

function multipart(boundary: string, type: string, content: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="picture"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`
  )
}

test('the picture upload refuses a declared size over 2 MB before it reads the body', async () => {
  const body = Buffer.alloc(1000, 0x61)
  const { event, req } = requestAs('person-a', { 'content-type': 'multipart/form-data; boundary=B', 'content-length': '3000000' }, body)
  await assert.rejects(uploadHandler(event), (error: { statusCode?: number, message?: string }) => {
    assert.equal(error.statusCode, 413)
    assert.match(error.message ?? '', /2 MB or smaller/)
    return true
  })
  assert.equal(req.readableLength, body.length, 'the body was not read')
})

test('the picture upload refuses a request that does not say its size, before it reads the body', async () => {
  const body = Buffer.alloc(1000, 0x61)
  for (const headers of [{ 'content-type': 'multipart/form-data; boundary=B' }, { 'content-type': 'multipart/form-data; boundary=B', 'content-length': 'lots' }]) {
    const { event, req } = requestAs('person-a', headers, body)
    await assert.rejects(uploadHandler(event), (error: { statusCode?: number, message?: string }) => {
      assert.equal(error.statusCode, 411)
      assert.match(error.message ?? '', /must say its size/)
      return true
    })
    assert.equal(req.readableLength, body.length, 'the body was not read')
  }
})

test('the picture upload refuses a file type that is not a picture, after reading a small body', async () => {
  const body = multipart('B', 'text/plain', 'not a picture')
  const { event } = requestAs('person-a', { 'content-type': 'multipart/form-data; boundary=B', 'content-length': String(body.length) }, body)
  await assert.rejects(uploadHandler(event), (error: { statusCode?: number, message?: string }) => {
    assert.equal(error.statusCode, 400)
    assert.match(error.message ?? '', /must be a PNG, JPEG, WebP or SVG file/)
    return true
  })
})

test('the display-name change refuses another person before the update', async () => {
  const body = Buffer.from(JSON.stringify({ name: 'Someone Else', userId: 'person-b' }))
  const { event } = requestAs('person-a', { 'content-type': 'application/json', 'content-length': String(body.length) }, body)
  await assert.rejects(nameHandler(event), (error: { statusCode?: number, message?: string }) => {
    assert.equal(error.statusCode, 403)
    assert.match(error.message ?? '', /only your own name/)
    return true
  })
})

test('the display-name change refuses an empty name before the update', async () => {
  const body = Buffer.from(JSON.stringify({ name: '   ' }))
  const { event } = requestAs('person-a', { 'content-type': 'application/json', 'content-length': String(body.length) }, body)
  await assert.rejects(nameHandler(event), (error: { statusCode?: number }) => {
    assert.equal(error.statusCode, 400)
    return true
  })
})
