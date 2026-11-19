// A changelog fragment is its entry and nothing else (CONTRIBUTING.md, "Changelog"; Nina's new should on 93a3c2d): every
// non-empty line is a bullet, so no loose "Files:" paragraph is folded into CHANGELOG.md. A path a bullet names in
// backticks must exist in the repository, so the changelog cannot point at a file that moved. Run:
//   node --import tsx --test tests/changelog-fragment-files.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const FOLDER = join(ROOT, 'changelog.d')

// The folder is absent when no fragment is pending (a release folds them away): then there is nothing to check.
const fragments = existsSync(FOLDER) ? readdirSync(FOLDER).filter(name => name.endsWith('.md')).sort() : []

for (const name of fragments) {
  const lines = readFileSync(join(FOLDER, name), 'utf8').split('\n').filter(line => line.trim() !== '')

  test(`${name} is only bullets: no Files paragraph or other loose line`, () => {
    for (const line of lines) {
      assert.ok(line.startsWith('- '), `"${line.slice(0, 60)}" is not a bullet; the fold would copy it into CHANGELOG.md`)
    }
  })

  test(`${name} names only paths that exist`, () => {
    for (const line of lines) {
      for (const match of line.matchAll(/`([^`]+)`/g)) {
        const path = match[1]!
        if (!path.includes('/')) continue
        assert.ok(existsSync(join(ROOT, path)), `${path} does not exist in the repository`)
      }
    }
  })
}
