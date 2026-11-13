// The Empty route's ages: the route accepts the same ages the inbox page offers, and it exports a handler. No database:
// importing the route only builds the postgres client, which connects on its first query, and the Nitro globals the
// route uses at load time are stubbed here.
//   node --import tsx --test tests/notifications-empty-route.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const g = globalThis as Record<string, unknown>
g.defineEventHandler ??= (handler: unknown) => handler
g.readBody ??= async () => ({})
g.createError ??= (init: { statusCode: number, message: string }) => Object.assign(new Error(init.message), init)

test('the route accepts 30 days, 2 months, 6 months and 1 year, and exports a handler', async () => {
  const route = await import('../server/api/notifications/empty.post')
  assert.deepEqual(route.EMPTY_AGES, [30, 60, 182, 365])
  assert.equal(typeof route.default, 'function')
})

test('the inbox page offers exactly the ages the route accepts', async () => {
  const route = await import('../server/api/notifications/empty.post')
  const page = readFileSync(join(root, 'app/pages/projects/inbox.vue'), 'utf8')
  const offered = [...page.matchAll(/olderThanDays:\s*(\d+)/g)].map(match => Number(match[1]))
  assert.deepEqual(offered, route.EMPTY_AGES)
})
