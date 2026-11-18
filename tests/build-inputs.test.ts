// What the build reads, and the hash over it (scripts/build-inputs.mjs, card mwkf0nartlrd5n8lz2o). The skip decision rests on this hash:
// a change in anything the build reads must change it, and a change in anything it does not read must not. Fake trees in memory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashInputs, isBuildEnv, isBuildInput } from '../scripts/build-inputs.mjs'

const BASE: Record<string, string> = {
  'app/pages/index.vue': '<template>home</template>',
  'server/api/version.get.ts': 'export default 1',
  'shared/utils/x.ts': 'export const x = 1',
  'public/favicon.ico': 'icon',
  'nuxt.config.ts': 'export default {}',
  'tsconfig.json': '{}',
  'bun.lock': 'lock v1',
  'package.json': JSON.stringify({ name: 'app', version: '0.39.4', dependencies: { vue: '3' } }, null, 2)
}
const ENV = { bun: '1.3.0', node: '22.23.4' }
const hash = (files: Record<string, string>, env: Record<string, string> = {}) => hashInputs(files, { ...ENV, env })

test('the same tree gives the same hash', () => {
  assert.equal(hash(BASE), hash({ ...BASE }))
})

test('a change in package.json that is only the version does not change the hash', () => {
  const bumped = { ...BASE, 'package.json': JSON.stringify({ name: 'app', version: '0.39.5', dependencies: { vue: '3' } }, null, 2) }
  assert.equal(hash(bumped), hash(BASE))
})

test('a change in package.json dependencies does change the hash', () => {
  const changed = { ...BASE, 'package.json': JSON.stringify({ name: 'app', version: '0.39.4', dependencies: { vue: '3.5' } }, null, 2) }
  assert.notEqual(hash(changed), hash(BASE))
})

for (const file of ['app/pages/index.vue', 'server/api/version.get.ts', 'shared/utils/x.ts', 'public/favicon.ico', 'nuxt.config.ts', 'tsconfig.json', 'bun.lock']) {
  test(`a change in ${file} changes the hash`, () => {
    assert.notEqual(hash({ ...BASE, [file]: 'changed' }), hash(BASE))
  })
}

test('a new file under app/ changes the hash', () => {
  assert.notEqual(hash({ ...BASE, 'app/pages/new.vue': 'new' }), hash(BASE))
})

for (const file of [
  'tests/build-inputs.test.ts',
  'app/components/Foo.test.ts',
  'server/utils/x.spec.ts',
  'crew/kit-files.txt',
  'crew/SKILL.md',
  'changelog.d/abc-fragment.md',
  'CHANGELOG.md',
  'README.md',
  'CONTRIBUTING.md',
  'nix/hashes.json',
  'data/anything.json',
  '.nuxt/dist/entry.js',
  '.output/public/index.html',
  'node_modules/vue/index.js'
]) {
  test(`a change in ${file} does not change the hash (the build does not read it)`, () => {
    assert.equal(hash({ ...BASE, [file]: 'changed' }), hash(BASE))
  })
}

test('the chore that only refreshes nix/hashes.json gives the same hash (so its release is a skip)', () => {
  const withNix = { ...BASE, 'nix/hashes.json': '{"a":"1"}' }
  const refreshed = { ...BASE, 'nix/hashes.json': '{"a":"2"}' }
  assert.equal(hash(withNix), hash(refreshed))
  assert.equal(hash(refreshed), hash(BASE))
})

test('isBuildInput: app, server, shared, public, docs (the help pages are bundled) and the configs are in; tests, crew and the rest are out', () => {
  assert.equal(isBuildInput('app/pages/index.vue'), true)
  assert.equal(isBuildInput('server/api/x.ts'), true)
  assert.equal(isBuildInput('nuxt.config.ts'), true)
  assert.equal(isBuildInput('docs/admin/configuration.md'), true)
  assert.equal(isBuildInput('app/x.test.ts'), false)
  assert.equal(isBuildInput('crew/x.mjs'), false)
  assert.equal(isBuildInput('drizzle.config.ts'), false)
})

test('a change in a help page under docs/ changes the hash (the help pages are bundled into the server)', () => {
  assert.notEqual(hash({ ...BASE, 'docs/admin/configuration.md': 'changed' }), hash(BASE))
})

test('a build-time environment value that the build reads changes the hash; an unlisted one does not', () => {
  assert.equal(isBuildEnv('NODE_ENV'), true)
  assert.equal(isBuildEnv('NUXT_PUBLIC_GITHUB_ENABLED'), true)
  assert.equal(isBuildEnv('VITE_SOMETHING'), true)
  assert.equal(isBuildEnv('TASKMANAGER_BUILD'), false, 'the revision is read at run time, so it must not force a build')
  for (const name of ['NODE_ENV', 'NUXT_PUBLIC_GITHUB_ENABLED', 'VITE_SOMETHING']) {
    assert.notEqual(hash(BASE, { [name]: 'x' }), hash(BASE), `${name} is in the hash`)
  }
  assert.equal(hash(BASE, { TASKMANAGER_BUILD: 'abc1234' }), hash(BASE))
  assert.equal(hash(BASE, { TASKMANAGER_UNRELATED_VALUE: 'x' }), hash(BASE))
})

test('a different Bun or Node version changes the hash', () => {
  assert.notEqual(hashInputs(BASE, { bun: '1.3.1', node: '22.23.4', env: {} }), hashInputs(BASE, { bun: '1.3.0', node: '22.23.4', env: {} }))
  assert.notEqual(hashInputs(BASE, { bun: '1.3.0', node: '22.23.5', env: {} }), hashInputs(BASE, { bun: '1.3.0', node: '22.23.4', env: {} }))
})
