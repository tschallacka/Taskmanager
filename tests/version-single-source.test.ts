// The version lives in package.json only. The MCP server's serverInfo, /api/version and /api/health
// must all say the version package.json says, and the nix files must read it from there instead of
// carrying a copy. The health check needs the database, so this needs the scratch one. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/version-single-source.test.ts
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createError, setResponseHeader, setResponseStatus } from 'h3'

// Nitro provides these as globals to the route files. Here they only have to work.
Object.assign(globalThis, { createError, setResponseHeader, setResponseStatus })
Object.assign(globalThis, { defineEventHandler: (handler: unknown) => handler })

const { default: versionRoute } = await import('../server/api/version.get')
const { default: healthRoute } = await import('../server/api/health.get')
const { db } = await import('../server/db')

const ROOT = process.cwd()
const packageVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string

after(async () => {
  await db.$client.end()
})

// A version written as a plain string literal, such as "0.1.0" or '0.1.0'.
const LITERAL_VERSION = /["']\d+\.\d+\.\d+["']/

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

test('package.json has a semantic version', () => {
  assert.match(packageVersion, /^\d+\.\d+\.\d+$/)
})

// A request with no cookie and no authorization header, carrying the node response that h3's helpers write to.
function eventFor(path: string) {
  return {
    path,
    method: 'GET',
    headers: new Headers(),
    context: {} as Record<string, unknown>,
    node: {
      req: { headers: {} },
      res: { statusCode: 200, setHeader: () => {}, getHeader: () => undefined }
    }
  }
}

test('/api/version and /api/health answer the version of package.json', async () => {
  const info = await (versionRoute as unknown as (event: unknown) => Promise<{ version: string }>)(eventFor('/api/version'))
  const health = await (healthRoute as unknown as (event: unknown) => Promise<{ status: string, version: string }>)(eventFor('/api/health'))
  assert.equal(info.version, packageVersion)
  assert.equal(health.status, 'ok')
  assert.equal(health.version, packageVersion)
})

test('the MCP server reports the version of package.json as its serverInfo', () => {
  // The initialize answer carries SERVER_VERSION. It must be the one shared constant, which reads package.json,
  // and the file must not carry its own copy of the number.
  const source = read('server/api/mcp/index.post.ts')
  assert.match(source, /import \{ APP_VERSION \} from '\.\.\/\.\.\/utils\/appVersion'/)
  assert.match(source, /const SERVER_VERSION = APP_VERSION\b/)
  assert.doesNotMatch(source, LITERAL_VERSION)
  assert.match(read('server/utils/appVersion.ts'), /import pkg from '\.\.\/\.\.\/package\.json'/)
})

test('the nix files read the version from package.json and contain no literal version', () => {
  const nixDir = join(ROOT, 'nix')
  const files = readdirSync(nixDir).filter(name => name.endsWith('.nix'))
  assert.ok(files.includes('arnotes.nix') && files.includes('packages.nix') && files.includes('schema.nix'))
  for (const name of files) {
    const source = read(join('nix', name))
    assert.doesNotMatch(source, /version\s*=\s*"\d+\.\d+\.\d+"/, `${name} carries a literal version`)
  }
  for (const name of ['arnotes.nix', 'packages.nix']) {
    assert.match(read(join('nix', name)), /\(builtins\.fromJSON \(builtins\.readFile \.\.\/package\.json\)\)\.version/, name)
  }
})
