// The profile routes run as handlers, not read as text: the picture upload (server/api/account/avatar.post.ts) and the
// display-name change (server/api/account/name.put.ts). The refusal paths run without a database: the size is refused
// before the body is read, the type after it, and another person's name or an empty name before the better-auth update.
// The accepted upload writes the picture and the user row, so it runs only when DATABASE_URL names a database that has the
// schema (the scratch database in this worktree); without it, that one test is skipped and says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { createError, createEvent, getHeader, readBody, readMultipartFormData } from 'h3'
import { avatarDir } from '../server/utils/avatarStore'

// Nitro provides these as globals; the route files use them without importing.
Object.assign(globalThis, {
  createError,
  getHeader,
  readBody,
  readMultipartFormData,
  defineEventHandler: (fn: unknown) => fn
})
// Whether a real database was named. Set before the routes load: they import the database module, which reads this at load.
const haveDb = Boolean(process.env.DATABASE_URL)
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

function multipartBytes(boundary: string, type: string, bytes: Buffer): Buffer {
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="picture"\r\nContent-Type: ${type}\r\n\r\n`)
  return Buffer.concat([head, bytes, Buffer.from(`\r\n--${boundary}--\r\n`)])
}

test('the accepted upload stores the picture under the person folder and sets their image', { skip: haveDb ? false : 'DATABASE_URL is not set: the accepted path writes the database' }, async () => {
  const { db } = await import('../server/db')
  const { user } = await import('../server/db/schema')
  const { eq } = await import('drizzle-orm')
  const id = `avatar-accept-${randomBytes(4).toString('hex')}`
  const at = new Date()
  await db.insert(user).values({ id, name: 'Accept Test', email: `${id}@avatar.test`, emailVerified: true, createdAt: at, updatedAt: at })
  try {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])
    const body = multipartBytes('B', 'image/png', png)
    const { event } = requestAs(id, { 'content-type': 'multipart/form-data; boundary=B', 'content-length': String(body.length) }, body)
    const result = await uploadHandler(event) as { ok: boolean, image: string }
    assert.equal(result.ok, true)
    assert.match(result.image, new RegExp(`^/api/account/avatars/${id}/[a-f0-9]{24}\\.png$`))
    const stored = result.image.split('/').pop() ?? ''
    assert.equal(existsSync(join(avatarDir(id), stored)), true, 'the picture is on disk under the person folder')
    const [row] = await db.select().from(user).where(eq(user.id, id))
    assert.equal(row?.image, result.image, 'the user row points at the picture')
  } finally {
    await db.delete(user).where(eq(user.id, id))
    rmSync(avatarDir(id), { recursive: true, force: true })
  }
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
