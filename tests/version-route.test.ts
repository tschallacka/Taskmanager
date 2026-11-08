// GET /api/version: its shape, the version it shares with /api/health, no session needed, and it still
// answers in maintenance mode. The health check needs the database, so this needs the scratch one. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/version-route.test.ts
import { after, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createError, setResponseHeader, setResponseStatus } from 'h3'

// Nitro provides these as globals to the route and middleware files. Here they only have to work.
Object.assign(globalThis, { createError, setResponseHeader, setResponseStatus })
Object.assign(globalThis, { defineEventHandler: (handler: unknown) => handler })

const { default: versionRoute } = await import('../server/api/version.get')
const { default: healthRoute } = await import('../server/api/health.get')
const { default: maintenance } = await import('../server/middleware/maintenance')
const { default: requireAuth } = await import('../server/middleware/requireAuth')
const { buildCrewKit } = await import('../server/utils/crewKit')
const { db } = await import('../server/db')

const ROOT = process.cwd()
const packageVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string

// The environment variables these tests change, put back after each test.
const SAVED = { MAINTENANCE_MODE: process.env.MAINTENANCE_MODE, TASKMANAGER_BUILD: process.env.TASKMANAGER_BUILD }
afterEach(() => {
  for (const [name, value] of Object.entries(SAVED)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
})
after(async () => {
  await db.$client.end()
})

// A request with no cookie and no authorization header, carrying the node response that h3's helpers write to.
function eventFor(path: string) {
  const headers: Record<string, string> = {}
  return {
    path,
    method: 'GET',
    headers: new Headers(),
    context: {} as Record<string, unknown>,
    node: {
      req: { headers: {} },
      res: {
        statusCode: 200,
        setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value },
        getHeader: (name: string) => headers[name.toLowerCase()]
      }
    }
  }
}

type Handler = (event: ReturnType<typeof eventFor>) => unknown
const call = (handler: unknown, path = '/api/version') => (handler as Handler)(eventFor(path))

test('the version route answers name, version, build and kit', async () => {
  const info = await call(versionRoute) as Record<string, unknown>
  assert.deepEqual(Object.keys(info).sort(), ['build', 'kit', 'name', 'version'])
  assert.equal(info.name, 'Taskmanager')
  assert.equal(info.version, packageVersion)
})

test('build is the deploy-provided TASKMANAGER_BUILD, else null', async () => {
  Reflect.deleteProperty(process.env, 'TASKMANAGER_BUILD')
  assert.equal((await call(versionRoute) as { build: unknown }).build, null)

  process.env.TASKMANAGER_BUILD = '   '
  assert.equal((await call(versionRoute) as { build: unknown }).build, null)

  process.env.TASKMANAGER_BUILD = ' abc1234 '
  assert.equal((await call(versionRoute) as { build: unknown }).build, 'abc1234')
})

test('kit is the 12-character version the instance serves', async () => {
  const kit = (await call(versionRoute) as { kit: unknown }).kit
  assert.equal(kit, buildCrewKit().version)
  assert.match(String(kit), /^[0-9a-f]{12}$/)
})

test('the version route needs no session and is not behind the auth middleware', async () => {
  // requireAuth returns without a session check for a path it does not guard; a guarded path would throw here.
  assert.equal(await requireAuth(eventFor('/api/version') as never), undefined)
  assert.equal(await requireAuth(eventFor('/api/health') as never), undefined)
  const info = await call(versionRoute) as { version: unknown }
  assert.equal(info.version, packageVersion)
})

test('the version route still answers in maintenance mode', async () => {
  process.env.MAINTENANCE_MODE = '1'
  assert.equal(await maintenance(eventFor('/api/version') as never), undefined)
  assert.equal(await maintenance(eventFor('/api/health') as never), undefined)
  // Any other API path is still refused while maintenance is on.
  const refused = await maintenance(eventFor('/api/tasks') as never) as { statusCode: number }
  assert.equal(refused.statusCode, 503)
})

test('health and version agree on the version', async () => {
  const health = await call(healthRoute, '/api/health') as { status: string, version: string }
  const info = await call(versionRoute) as { version: string }
  assert.equal(health.status, 'ok')
  assert.equal(health.version, info.version)
  assert.equal(health.version, packageVersion)
})
