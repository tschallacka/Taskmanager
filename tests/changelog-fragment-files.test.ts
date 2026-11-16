// Every changelog fragment in changelog.d/ names its files once, under one "Files:" sentence, and each path it names
// exists in the repository. A path that moved, or a second "Files:" sentence, is refused here, so the changelog cannot
// point at a file that is not there. Run:
//   node --import tsx --test tests/changelog-fragment-files.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const FOLDER = join(ROOT, 'changelog.d')

const fragments = readdirSync(FOLDER).filter(name => name.endsWith('.md')).sort()

test('there is at least one fragment to check', () => {
  assert.ok(fragments.length > 0)
})

for (const name of fragments) {
  const text = readFileSync(join(FOLDER, name), 'utf8')

  test(`${name} says "Files:" once`, () => {
    const count = text.split('Files:').length - 1
    assert.equal(count, 1, `found ${count} "Files:" sentences; list all the files in one`)
  })

  test(`${name} names only paths that exist`, () => {
    const section = text.slice(text.indexOf('Files:'))
    const paths = [...section.matchAll(/`([^`]+)`/g)].map(match => match[1]!)
    assert.ok(paths.length > 0, 'the Files: sentence names no file')
    for (const path of paths) {
      assert.ok(existsSync(join(ROOT, path)), `${path} does not exist in the repository`)
    }
  })
}
