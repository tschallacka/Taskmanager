// The version the running server reports (server/utils/appVersionFile.ts, card mwkf0nartlrd5n8lz2o). It is read at run time, so a copied
// build reports the version of its own release: the VERSION file the wrapper writes, then the package.json of the release, and only in
// dev the value bundled at build time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readAppVersion } from '../server/utils/appVersionFile'

function folder() {
  return mkdtempSync(join(tmpdir(), 'app-version-'))
}

test('the VERSION file in .output wins', () => {
  const cwd = folder()
  mkdirSync(join(cwd, '.output'))
  writeFileSync(join(cwd, '.output', 'VERSION'), '0.42.1\n')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.42.0' }))
  assert.equal(readAppVersion({ cwd, bundled: '0.41.0' }), '0.42.1')
})

test('without a VERSION file, the package.json of the release is read', () => {
  const cwd = folder()
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.42.0' }))
  assert.equal(readAppVersion({ cwd, bundled: '0.41.0' }), '0.42.0')
})

test('a VERSION file that is not a version is skipped, and the next source is read', () => {
  const cwd = folder()
  mkdirSync(join(cwd, '.output'))
  writeFileSync(join(cwd, '.output', 'VERSION'), 'not a version')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.42.0' }))
  assert.equal(readAppVersion({ cwd, bundled: '0.41.0' }), '0.42.0')
})

test('with neither file (dev), the value bundled at build time is the fallback', () => {
  assert.equal(readAppVersion({ cwd: folder(), bundled: '0.41.0' }), '0.41.0')
})

// The should: a supervisor may start the server from another folder than its release root. The server reads the VERSION of the
// release its own code runs from (the .output above its module), so a different working folder cannot report another version.
test('the release the server runs from wins over the working folder', () => {
  const release = folder()
  mkdirSync(join(release, '.output', 'server', 'chunks', 'nitro'), { recursive: true })
  writeFileSync(join(release, '.output', 'VERSION'), '0.42.2\n')
  const otherWorkingFolder = folder()
  mkdirSync(join(otherWorkingFolder, '.output'))
  writeFileSync(join(otherWorkingFolder, '.output', 'VERSION'), '0.42.1\n')
  const moduleDir = join(release, '.output', 'server', 'chunks', 'nitro')
  assert.equal(readAppVersion({ cwd: otherWorkingFolder, bundled: '0.41.0', moduleDir }), '0.42.2')
})

test('a server whose working folder is its release root reads the same VERSION', () => {
  const release = folder()
  mkdirSync(join(release, '.output', 'server'), { recursive: true })
  writeFileSync(join(release, '.output', 'VERSION'), '0.42.2\n')
  assert.equal(readAppVersion({ cwd: release, bundled: '0.41.0', moduleDir: join(release, '.output', 'server') }), '0.42.2')
})

test('from the source tree (dev, no .output above the module), the working folder is read as before', () => {
  const cwd = folder()
  mkdirSync(join(cwd, '.output'))
  writeFileSync(join(cwd, '.output', 'VERSION'), '0.42.1\n')
  assert.equal(readAppVersion({ cwd, bundled: '0.41.0', moduleDir: join(folder(), 'server', 'utils') }), '0.42.1')
})
