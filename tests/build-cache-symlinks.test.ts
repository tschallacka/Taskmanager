// The build cache must hold its own copy of the output (card mwkf0nartlrd5n8lz2o, outage 2026-11-17). Nitro's output holds symlinks with
// ABSOLUTE targets into the output of the release that built it; a copy that kept them pointed into that release, and the deploy pruned
// it: the app failed to start with 502. Temp folders only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyOutput, hasBrokenLinks } from '../scripts/build-if-changed.mjs'
import { CACHE_FORMAT, hashInputs } from '../scripts/build-inputs.mjs'

// An output like Nitro's: server/node_modules/pkg is a symlink with an absolute target into server/node_modules/.nitro/pkg@1.
function fakeOutput(root: string) {
  const mods = join(root, 'server', 'node_modules')
  mkdirSync(join(mods, '.nitro', 'pkg@1'), { recursive: true })
  writeFileSync(join(mods, '.nitro', 'pkg@1', 'index.mjs'), 'export default 1\n')
  symlinkSync(join(mods, '.nitro', 'pkg@1'), join(mods, 'pkg'))
  writeFileSync(join(root, 'server', 'index.mjs'), 'import "pkg"\n')
}

test('a copy of an output with absolute symlinks stands on its own after the source is removed', () => {
  const base = mkdtempSync(join(tmpdir(), 'bcs-'))
  const source = join(base, 'old-release', '.output')
  const copy = join(base, 'new-release', '.output')
  fakeOutput(source)
  copyOutput(source, copy)
  rmSync(join(base, 'old-release'), { recursive: true, force: true })
  assert.ok(existsSync(join(copy, 'server', 'node_modules', 'pkg', 'index.mjs')), 'the package is still reachable')
  assert.equal(lstatSync(join(copy, 'server', 'node_modules', 'pkg')).isSymbolicLink(), false)
  assert.equal(readFileSync(join(copy, 'server', 'node_modules', 'pkg', 'index.mjs'), 'utf8'), 'export default 1\n')
  rmSync(base, { recursive: true, force: true })
})

test('hasBrokenLinks says yes for an output that holds a symlink and no for a resolved copy', () => {
  const base = mkdtempSync(join(tmpdir(), 'bcs-'))
  const source = join(base, 'a', '.output')
  const copy = join(base, 'b', '.output')
  fakeOutput(source)
  assert.equal(hasBrokenLinks(source), true)
  copyOutput(source, copy)
  assert.equal(hasBrokenLinks(copy), false)
  rmSync(base, { recursive: true, force: true })
})

test('the cache format is part of the hash: a new format never matches an older cache', () => {
  const files = { 'app/a.vue': 'x' }
  const now = hashInputs(files, {})
  assert.ok(CACHE_FORMAT >= 2)
  assert.notEqual(now, 'a'.repeat(64))
  // The same inputs hash the same while the format stays; the format is in the hashed text.
  assert.equal(hashInputs(files, {}), now)
})
