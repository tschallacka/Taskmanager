// Icons come from our own server (card mwjfpwrmy51vqimyvsj): no visitor's IP goes to api.iconify.design. Source level:
// the Nuxt config serves icons from the app's own server and bundles the collections the app uses, with no API fallback,
// and no source file names the Iconify API. A browser run of the main pages is the other half (see the card).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

function walk(dir: string): string[] {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    const path = `${dir}${name}`
    if (statSync(new URL(path, root)).isDirectory()) return walk(`${path}/`)
    return /\.(vue|ts|mjs|js|tsx|css)$/.test(name) ? [path] : []
  })
}

test('the icon module serves from the app\'s own server and never falls back to the Iconify API', () => {
  const config = read('nuxt.config.ts')
  assert.match(config, /provider: 'server'/, 'icons are served by our own server')
  assert.match(config, /fallbackToApi: false/, 'no request to the Iconify API when an icon is missing')
  assert.match(config, /serverBundle: \{[\s\S]*collections: \[[^\]]*'lucide'/, 'the lucide icons are bundled on the server')
  assert.match(config, /serverBundle: \{[\s\S]*collections: \[[^\]]*'simple-icons'/, 'the simple-icons are bundled on the server')
  assert.match(config, /clientBundle: \{[\s\S]*scan: true/, 'the icons the client uses are bundled into the client')
})

test('no app or server source names the public Iconify API', () => {
  const offenders = [...walk('app/'), ...walk('server/'), ...walk('shared/')]
    .filter(path => /iconify\.design|api\.iconify\.com/.test(read(path)))
  assert.deepEqual(offenders, [], `these files name the Iconify API: ${offenders.join(', ')}`)
})

test('the icon collections in the config are the ones the app icon classes use', () => {
  const used = new Set<string>()
  for (const path of [...walk('app/'), ...walk('shared/')]) {
    for (const match of read(path).matchAll(/i-(lucide|simple-icons)-[a-z0-9-]+/g)) used.add(match[1] ?? '')
  }
  assert.ok(used.has('lucide'))
  for (const collection of used) {
    const config = read('nuxt.config.ts')
    assert.match(config, new RegExp(`'${collection}'`), `${collection} is used by the app and must be bundled`)
  }
})
