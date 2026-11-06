// Only the instance admin may change the instance's name and icon: the guard that the branding routes call
// refuses a person who is not the instance admin, and the change route checks it before it reads the body.
// Needs the dev database (two scratch users). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/instance-branding-admin.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createError } from 'h3'
import { inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the guard under test uses it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { user } = await import('../server/db/schema')
const { requireInstanceAdmin } = await import('../server/utils/instanceAdmin')

const tag = randomBytes(4).toString('hex')
const admin = `brand-admin-${tag}`
const member = `brand-member-${tag}`
const at = new Date()
const eventFor = (id: string) => ({ context: { session: { user: { id } } } }) as never

before(async () => {
  await db.insert(user).values([
    { id: admin, name: admin, email: `${admin}@arnotes.test`, emailVerified: true, isInstanceAdmin: true, createdAt: at, updatedAt: at },
    { id: member, name: member, email: `${member}@arnotes.test`, emailVerified: true, isInstanceAdmin: false, createdAt: at, updatedAt: at }
  ])
})

after(async () => {
  await db.delete(user).where(inArray(user.id, [admin, member]))
  await db.$client.end()
})

test('a person who is not the instance admin is refused the branding guard with 403', async () => {
  await assert.rejects(requireInstanceAdmin(eventFor(member)), (e: { statusCode?: number }) => e.statusCode === 403)
})

test('the instance admin passes the branding guard', async () => {
  await requireInstanceAdmin(eventFor(admin))
})

test('the branding routes call the guard before they read or change anything', () => {
  for (const file of ['server/api/admin/branding.put.ts', 'server/api/admin/branding.get.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const guard = source.indexOf('await requireInstanceAdmin(event)')
    assert.ok(guard > 0, `${file} calls the guard`)
    const beforeGuard = source.slice(0, guard)
    assert.ok(!/readBody\(|brandingOf\(|saveBranding\(|resetBranding\(/.test(beforeGuard), `${file} does no work before the guard`)
    assert.ok(guard > 0 && !/readBody\(|brandingOf\(|saveBranding\(|resetBranding\(/.test(source.slice(0, guard)), `${file} calls the guard before any work`)
  }
})
