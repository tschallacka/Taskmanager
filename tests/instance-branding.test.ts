// The instance's name and icon: what the admin may set (cleanInstanceName, checkIcon), and the built-in name
// when nothing is set. The checks need no database; the last test needs the instance_settings table, and skips
// with the reason when the dev database does not have it yet. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/instance-branding.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { DEFAULT_INSTANCE_NAME, INSTANCE_NAME_MAX, checkIcon, cleanInstanceName } = await import('../server/utils/instanceBranding')

const refused = (fn: () => unknown, status = 400) =>
  assert.throws(fn, (e: { statusCode?: number }) => e.statusCode === status)

// A PNG header: the signature, then an IHDR chunk with the width and height. Enough for the check; no pixels.
function pngHeader(width: number, height: number): string {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.write('IHDR', 12, 'latin1')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes.toString('base64')
}

test('the default name is the built-in one, and the name is trimmed, short, plain text', () => {
  assert.equal(DEFAULT_INSTANCE_NAME, 'Taskmanager')
  assert.equal(cleanInstanceName('  Acme   Tasks  '), 'Acme Tasks')
  assert.equal(cleanInstanceName('x'.repeat(INSTANCE_NAME_MAX)), 'x'.repeat(INSTANCE_NAME_MAX))
  refused(() => cleanInstanceName('   '))
  refused(() => cleanInstanceName(undefined))
  refused(() => cleanInstanceName(42))
  refused(() => cleanInstanceName('x'.repeat(INSTANCE_NAME_MAX + 1)))
  refused(() => cleanInstanceName('<b>Acme</b>'))
  refused(() => cleanInstanceName('Acme\u0007'))
})

test('a PNG icon is accepted when it is square and at least 512 pixels; anything else is refused', () => {
  const ok = checkIcon('image/png', pngHeader(512, 512))
  assert.equal(ok.mime, 'image/png')
  assert.equal(checkIcon('image/png', pngHeader(1024, 1024)).mime, 'image/png')
  refused(() => checkIcon('image/png', pngHeader(511, 511)))
  refused(() => checkIcon('image/png', pngHeader(512, 256)))
  refused(() => checkIcon('image/png', Buffer.from('not a picture at all, really not').toString('base64')))
  refused(() => checkIcon('image/jpeg', pngHeader(512, 512)))
  refused(() => checkIcon('image/png', ''))
  refused(() => checkIcon('image/png', Buffer.alloc(600 * 1024, 1).toString('base64')))
})

test('an SVG icon is accepted with an svg root and no scripts or event handlers', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"/></svg>').toString('base64')
  assert.equal(checkIcon('image/svg+xml', svg).mime, 'image/svg+xml')
  const script = Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')
  refused(() => checkIcon('image/svg+xml', script))
  const handler = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')
  refused(() => checkIcon('image/svg+xml', handler))
  const link = Buffer.from('<svg><a href="javascript:alert(1)"><rect/></a></svg>').toString('base64')
  refused(() => checkIcon('image/svg+xml', link))
  refused(() => checkIcon('image/svg+xml', Buffer.from('<html></html>').toString('base64')))
})
