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

// Nina's should (card mwkf0nartlrd5n8lz2o): the server runs from state/, not from its release, so the version and the build id come
// from the release it runs (TASKMANAGER_RELEASE, set by run-server.sh), not from the working folder.
test('the version is read from the release the server runs, not from its working folder (state/)', () => {
  const release = folder()
  mkdirSync(join(release, '.output'))
  writeFileSync(join(release, '.output', 'VERSION'), '0.47.1\n')
  const workingFolder = folder()
  assert.equal(readAppVersion({ cwd: workingFolder, release, bundled: '0.41.0' }), '0.47.1')
})

test('the build id is read from the release the server runs (REVISION there), not from the working folder', async () => {
  const release = folder()
  writeFileSync(join(release, 'REVISION'), '0123456789abcdef0123456789abcdef01234567\n')
  const before = process.env.TASKMANAGER_RELEASE
  process.env.TASKMANAGER_RELEASE = release
  try {
    const { appBuild } = await import('../server/utils/appVersion')
    assert.equal(appBuild(), '0123456')
  } finally {
    if (before === undefined) delete process.env.TASKMANAGER_RELEASE
    else process.env.TASKMANAGER_RELEASE = before
  }
})
