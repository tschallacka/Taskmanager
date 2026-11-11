// The build id the Blaze deploy gives: the commit in the REVISION file at the release root, cut to 7 characters,
// and TASKMANAGER_BUILD wins over it. No database and no network. Each test works in a throwaway folder under
// tests/, removed afterwards, and never touches the real release root. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/app-build-revision.test.ts
import { after, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { appBuild, readRevision } from '../server/utils/appVersion'

const ROOT = process.cwd()
const scratchRoot = resolve(ROOT, 'tests')
const folders: string[] = []

// A fresh folder under tests/, with the REVISION file written when `revision` is given.
function folderWith(revision?: string): string {
  mkdirSync(scratchRoot, { recursive: true })
  const dir = mkdtempSync(join(scratchRoot, '.revision-'))
  folders.push(dir)
  if (revision !== undefined) writeFileSync(join(dir, 'REVISION'), revision)
  return dir
}

const SAVED = { TASKMANAGER_BUILD: process.env.TASKMANAGER_BUILD }
afterEach(() => {
  process.chdir(ROOT)
  for (const [name, value] of Object.entries(SAVED)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
})
after(() => {
  process.chdir(ROOT)
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

test('REVISION holding a full commit id gives its first 7 characters', () => {
  const dir = folderWith('0123456789abcdef0123456789abcdef01234567\n')
  assert.equal(readRevision(dir), '0123456')
})

test('REVISION is trimmed before it is cut', () => {
  const dir = folderWith('  ABCDEF1234  \r\n')
  assert.equal(readRevision(dir), 'abcdef1')
})

test('no REVISION file gives null', () => {
  assert.equal(readRevision(folderWith()), null)
})

test('garbage in REVISION gives null', () => {
  assert.equal(readRevision(folderWith('not a commit id')), null)
  assert.equal(readRevision(folderWith('')), null)
  assert.equal(readRevision(folderWith('abc12')), null)
  assert.equal(readRevision(folderWith('xyz1234567')), null)
})

test('a REVISION that is a folder, not a file, gives null', () => {
  const dir = folderWith()
  mkdirSync(join(dir, 'REVISION'))
  assert.equal(readRevision(dir), null)
})

test('appBuild takes TASKMANAGER_BUILD over REVISION in the working folder', () => {
  const dir = folderWith('0123456789abcdef0123456789abcdef01234567')
  process.chdir(dir)
  process.env.TASKMANAGER_BUILD = ' abc1234 '
  assert.equal(appBuild(), 'abc1234')
})

test('appBuild reads REVISION from the working folder when TASKMANAGER_BUILD is unset or blank', () => {
  const dir = folderWith('0123456789abcdef0123456789abcdef01234567')
  process.chdir(dir)
  Reflect.deleteProperty(process.env, 'TASKMANAGER_BUILD')
  assert.equal(appBuild(), '0123456')
  process.env.TASKMANAGER_BUILD = '   '
  assert.equal(appBuild(), '0123456')
})

test('appBuild is null with neither TASKMANAGER_BUILD nor REVISION', () => {
  process.chdir(folderWith())
  Reflect.deleteProperty(process.env, 'TASKMANAGER_BUILD')
  assert.equal(appBuild(), null)
})
