// app/assets/css/tokens.css and app/app.config.ts (`tokens`) hold the same fixed design values:
// the status tones, the eight states that name them, and the focus ring. This test reads both
// files and fails when they disagree, or when a state names a tone that does not exist, or when
// the stylesheet loses a token the components use. Run:
//   node --import tsx --test tests/design-tokens.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const css = readFileSync(join(ROOT, 'app', 'assets', 'css', 'tokens.css'), 'utf8')
const mainCss = readFileSync(join(ROOT, 'app', 'assets', 'css', 'main.css'), 'utf8')
const appConfig = readFileSync(join(ROOT, 'app', 'app.config.ts'), 'utf8')

// The block of a selector, from its opening brace to the matching close.
function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `no block for ${selector}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unclosed block for ${selector}`)
}

function declarations(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim())
  return out
}

const dark = declarations(block(css, ':root'))
const light = declarations(block(css, '.light'))
const tones = ['ok', 'warn', 'danger', 'info', 'team'] as const
const toneVar: Record<string, string> = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', team: 'team' }

// The tokens.css values for one mode, and the app.config values, must be the same strings.
function appConfigTones(): Record<string, { dark: Record<string, string>, light: Record<string, string> }> {
  const tokensStart = appConfig.indexOf('tones:')
  const statesStart = appConfig.indexOf('states:')
  const section = appConfig.slice(tokensStart, statesStart)
  const result: Record<string, { dark: Record<string, string>, light: Record<string, string> }> = {}
  for (const tone of tones) {
    const at = section.indexOf(`${tone}: {`)
    assert.notEqual(at, -1, `app.config.ts has no tone ${tone}`)
    const body = section.slice(at, section.indexOf('}\n      }', at) + 1)
    const pick = (mode: string) => {
      const m = body.match(new RegExp(`${mode}:\\s*\\{\\s*bg:\\s*'([^']+)',\\s*fg:\\s*'([^']+)',\\s*dot:\\s*'([^']+)'`))
      assert.ok(m, `app.config.ts tone ${tone} has no ${mode} values`)
      return { bg: m[1]!, fg: m[2]!, dot: m[3]! }
    }
    result[tone] = { dark: pick('dark'), light: pick('light') }
  }
  return result
}

const normal = (v: string) => v.replace(/\s+/g, '').toLowerCase()

test('every status tone has the same background, text and dot in tokens.css and app.config.ts', () => {
  const config = appConfigTones()
  for (const tone of tones) {
    for (const [mode, vars] of [['dark', dark], ['light', light]] as const) {
      const expected = config[tone]![mode]
      const name = toneVar[tone]
      assert.equal(normal(vars.get(`--tm-tone-${name}-bg`) ?? ''), normal(expected.bg), `${mode} ${tone} bg`)
      assert.equal(normal(vars.get(`--tm-tone-${name}-fg`) ?? ''), normal(expected.fg), `${mode} ${tone} fg`)
      assert.equal(normal(vars.get(`--tm-tone-${name}-dot`) ?? ''), normal(expected.dot), `${mode} ${tone} dot`)
    }
  }
})

test('the eight card states each name a tone that exists in app.config.ts', () => {
  const statesBlock = appConfig.slice(appConfig.indexOf('states:'), appConfig.indexOf('// Keyboard focus'))
  const pairs = [...statesBlock.matchAll(/'?([\w-]+)'?:\s*'(\w+)'/g)].map(m => [m[1]!, m[2]!])
  assert.equal(pairs.length, 8, 'eight states')
  for (const [state, tone] of pairs) {
    assert.ok((tones as readonly string[]).includes(tone!), `${state} names unknown tone ${tone}`)
    assert.ok(dark.has(`--tm-status-${state}`), `tokens.css has no --tm-status-${state}`)
  }
})

test('dark is the default and light overrides only the tones and the accent text and shadows', () => {
  for (const name of ['--tm-canvas', '--tm-surface', '--tm-raised', '--tm-text', '--tm-accent', '--tm-focus']) {
    assert.ok(dark.has(name), `${name} in :root`)
  }
  // Roles are defined once, in :root; the light block must not repeat them.
  for (const name of ['--tm-canvas', '--tm-surface', '--tm-text']) assert.ok(!light.has(name), `${name} repeated in .light`)
  assert.ok(light.has('--tm-tone-warn-fg'), 'light tones present')
})

test('type, spacing and radius scales are complete', () => {
  for (const name of [
    '--tm-font-size-body', '--tm-line-body', '--tm-font-size-card-title', '--tm-line-card-title',
    '--tm-font-size-label', '--tm-font-size-greeting', '--tm-font-size-caption',
    '--tm-space-1', '--tm-space-2', '--tm-space-3', '--tm-space-4', '--tm-space-5', '--tm-space-6',
    '--tm-radius-sm', '--tm-radius-md', '--tm-radius-lg', '--tm-radius-xl', '--tm-radius-pill'
  ]) {
    assert.ok(dark.has(name), `${name} defined`)
  }
  assert.equal(dark.get('--tm-font-size-body'), '14px')
  assert.equal(dark.get('--tm-font-size-card-title'), '14px')
  assert.equal(dark.get('--tm-line-card-title'), '20px')
})

test('the focus ring is amber, 2 px, 2 px outside, and the stylesheet is loaded by the app', () => {
  assert.match(css, /:where\([^)]*\):focus-visible\s*\{\s*outline:\s*var\(--tm-focus-width\)\s*solid\s*var\(--tm-focus\)/)
  assert.equal(dark.get('--tm-focus-width'), '2px')
  assert.equal(dark.get('--tm-focus-offset'), '2px')
  assert.match(appConfig, /focus: \{ width: 2, offset: 2 \}/)
  assert.match(mainCss, /@import "\.\/tokens\.css";/)
})

test('reduced motion turns transitions and animations down to an instant', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /transition-duration:\s*0\.01ms !important/)
})
