// Instance settings (the gear by the logo, /admin/settings): the logo is checked before it is stored, the app name is
// one short line, the defaults come back on reset, the public read carries only the name and the logo, the key is
// never returned in full, and Claude Code for everyone follows the environment variable when it is set and the switch
// when it is not. Needs the test database with the schema pushed:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/instance-settings-page.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })
process.env.SECRETS_ENCRYPTION_KEY ||= randomBytes(32).toString('hex')

const { db } = await import('../server/db')
const { instanceSettings, user } = await import('../server/db/schema')
const {
  brandAdminView,
  brandPublic,
  DEFAULT_BRAND_NAME,
  logoDataUrl,
  readBrandName,
  sanitizeLogoSvg,
  saveBrand
} = await import('../server/utils/brand')
const {
  claudeEnvSetting,
  claudeForEveryoneOn,
  saveSprocketInstance,
  sprocketInstanceView,
  SPROCKET_INSTANCE_ROW_ID
} = await import('../server/utils/sprocketInstance')
const { mayUseClaude } = await import('../server/utils/sprocketAgent')
const { requireInstanceAdmin } = await import('../server/utils/instanceAdmin')

const tag = randomBytes(4).toString('hex')
const admin = `isx-${tag}-admin`
const plain = `isx-${tag}-plain`
const KEY = `sk-or-v1-${tag}-keyend9876`
const PLAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f39418"/></svg>'
const userIds = [admin, plain]
const now = new Date()

const savedEnv = process.env.SPROCKET_CLAUDE_FOR_ALL

async function resetRow() {
  await db.delete(instanceSettings).where(eq(instanceSettings.id, SPROCKET_INSTANCE_ROW_ID))
}

function refusedWith(fn: () => unknown, status = 400) {
  try {
    fn()
  } catch (e) {
    assert.equal((e as { statusCode?: number }).statusCode, status)
    return
  }
  assert.fail(`expected a ${status} refusal`)
}

before(async () => {
  await db.insert(user).values(userIds.map((id, i) => ({
    id,
    name: `isx ${i}`,
    email: `${id}@example.test`,
    emailVerified: true,
    isInstanceAdmin: id === admin,
    createdAt: now,
    updatedAt: now
  })))
  await resetRow()
})

after(async () => {
  if (savedEnv === undefined) delete process.env.SPROCKET_CLAUDE_FOR_ALL
  else process.env.SPROCKET_CLAUDE_FOR_ALL = savedEnv
  await resetRow()
  await db.delete(user).where(inArray(user.id, userIds))
})

test('a plain SVG logo is accepted; scripts, links out, handlers and oversize files are refused', () => {
  assert.equal(sanitizeLogoSvg(`  ${PLAIN_SVG}\n`), PLAIN_SVG)
  assert.equal(
    sanitizeLogoSvg('<svg xmlns="http://www.w3.org/2000/svg"><use href="#dot"/><defs><circle id="dot"/></defs></svg>'),
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="#dot"/><defs><circle id="dot"/></defs></svg>'
  )
  const refused = [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="https://example.test/x"><rect/></a></svg>',
    '<svg><image href="https://example.test/x.png"/></svg>',
    '<svg><rect style="fill:url(https://example.test/p.svg#a)"/></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
    '<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>',
    '<svg><style>@import "https://example.test/a.css";</style></svg>',
    '<html><body>not a logo</body></html>',
    'plain text',
    '',
    `<svg>${'a'.repeat(100_001)}</svg>`
  ]
  for (const svg of refused) {
    refusedWith(() => sanitizeLogoSvg(svg))
  }
})

test('the app name is one line of up to 40 characters', () => {
  assert.equal(readBrandName('  Acme Tasks  '), 'Acme Tasks')
  refusedWith(() => readBrandName(''))
  refusedWith(() => readBrandName('   '))
  refusedWith(() => readBrandName('x'.repeat(41)))
  refusedWith(() => readBrandName('two\nlines'))
  refusedWith(() => readBrandName(42))
})

test('branding saves, shows the logo as a data URL, and reset brings the defaults back', async () => {
  await resetRow()
  const before = await brandPublic()
  assert.deepEqual(before, { name: DEFAULT_BRAND_NAME, logoSrc: null })

  await saveBrand({ name: 'Acme Tasks', logoSvg: PLAIN_SVG }, admin)
  const set = await brandPublic()
  assert.equal(set.name, 'Acme Tasks')
  assert.equal(set.logoSrc, logoDataUrl(PLAIN_SVG))
  assert.ok(set.logoSrc?.startsWith('data:image/svg+xml;charset=utf-8,'))

  const adminView = await brandAdminView()
  assert.deepEqual(adminView, { name: 'Acme Tasks', customName: 'Acme Tasks', customLogo: true })

  await saveBrand({ name: null, logoSvg: null }, admin)
  assert.deepEqual(await brandPublic(), { name: DEFAULT_BRAND_NAME, logoSrc: null })
  assert.deepEqual(await brandAdminView(), { name: DEFAULT_BRAND_NAME, customName: null, customLogo: false })
})

test('a refused logo or name stores nothing', async () => {
  await resetRow()
  await saveBrand({ name: 'Kept' }, admin)
  refusedWith(() => readBrandName(''))
  await assert.rejects(() => saveBrand({ logoSvg: '<svg><script/></svg>' }, admin), (e: { statusCode?: number }) => e.statusCode === 400)
  await assert.rejects(() => saveBrand({ name: 'x'.repeat(50) }, admin), (e: { statusCode?: number }) => e.statusCode === 400)
  const view = await brandAdminView()
  assert.equal(view.name, 'Kept')
  assert.equal(view.customLogo, false)
})

test('the public branding carries only the name and the logo', async () => {
  await resetRow()
  await saveBrand({ name: 'Acme Tasks', logoSvg: PLAIN_SVG }, admin)
  await saveSprocketInstance({ apiKey: KEY, forEveryone: true }, admin)
  const pub = await brandPublic()
  assert.deepEqual(Object.keys(pub).sort(), ['logoSrc', 'name'])
  assert.ok(!JSON.stringify(pub).includes(KEY))
})

test('only the instance admin passes the admin rule for these pages and their API', async () => {
  await requireInstanceAdmin({ context: { session: { user: { id: admin } } } } as never)
  await assert.rejects(
    () => requireInstanceAdmin({ context: { session: { user: { id: plain } } } } as never),
    (e: { statusCode?: number }) => e.statusCode === 403
  )
})

test('the key never comes back in full: the view shows its last four characters only', async () => {
  await resetRow()
  await saveSprocketInstance({ apiKey: KEY, model: 'openai/gpt-4o-mini' }, admin)
  const view = await sprocketInstanceView()
  assert.equal(view.keySet, true)
  assert.equal(view.keyMasked?.endsWith('9876'), true)
  assert.equal(view.keyMasked?.includes(KEY.slice(0, 12)), false)
  assert.equal(JSON.stringify(view).includes(KEY), false)
  assert.equal(JSON.stringify(view).includes(`${tag}-keyend`), false)
  await saveSprocketInstance({ apiKey: null }, admin)
  assert.equal((await sprocketInstanceView()).keySet, false)
})

test('Claude Code for everyone: the environment variable decides when it is set, the switch when it is not', async () => {
  await resetRow()
  delete process.env.SPROCKET_CLAUDE_FOR_ALL
  assert.equal(claudeEnvSetting(), null)
  assert.equal(await claudeForEveryoneOn(), false)

  await saveSprocketInstance({ claudeForEveryone: true }, admin)
  assert.equal((await sprocketInstanceView()).claudeForEveryone, true)
  assert.equal(await claudeForEveryoneOn(), true)
  assert.equal(await mayUseClaude(plain), true)

  process.env.SPROCKET_CLAUDE_FOR_ALL = 'false'
  assert.equal(claudeEnvSetting(), 'false')
  assert.equal((await sprocketInstanceView()).claudeEnvSetting, 'false')
  assert.equal(await claudeForEveryoneOn(), false)
  assert.equal(await mayUseClaude(plain), false)
  assert.equal(await mayUseClaude(admin), true)

  process.env.SPROCKET_CLAUDE_FOR_ALL = 'true'
  await saveSprocketInstance({ claudeForEveryone: false }, admin)
  assert.equal(await claudeForEveryoneOn(), true)
  assert.equal(await mayUseClaude(plain), true)

  delete process.env.SPROCKET_CLAUDE_FOR_ALL
  await saveSprocketInstance({ claudeForEveryone: false }, admin)
  assert.equal(await mayUseClaude(plain), false)
})
