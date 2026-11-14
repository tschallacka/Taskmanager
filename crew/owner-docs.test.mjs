// The words of the marker-line rule, checked where a reader meets them: the README's update section, the init that writes
// the owner files, and the updater's header and messages. Source checks, no network, no files outside the kit. Run from the
// repo root: node --test crew/owner-docs.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')

describe('the README says one thing about the owner files', () => {
  const readme = read('README.md')

  test('no sentence still describes the old merge, its CONFLICT or its WARN for the owner files', () => {
    assert.doesNotMatch(readme, /owner's files[^.\n]*are merged/)
    assert.doesNotMatch(readme, /the merge with markers is set aside/)
    assert.doesNotMatch(readme, /says CONFLICT/)
    assert.doesNotMatch(readme, /prints a WARN; a later update merges/)
  })

  test('it says an owner edit above the marker is replaced, and the backup keeps it', () => {
    assert.match(readme, /edit above the marker line is replaced/)
    assert.match(readme, /backups\/update-<time>/)
  })

  test('it says old kit-base folders stay and are never read', () => {
    assert.match(readme, /kit-base[^.\n]*never read/)
  })
})

describe('init no longer writes kit-base', () => {
  test('init.mjs does not write a kit-base folder', () => {
    assert.doesNotMatch(read('init.mjs'), /kit-base/)
  })
})

describe('the updater', () => {
  const update = read('update.mjs')

  test('its header does not say the owner files are merged from kit-base', () => {
    const header = update.split('\n').slice(0, 12).join('\n')
    assert.doesNotMatch(header, /merged from the template/)
    assert.doesNotMatch(header, /kit-base/)
    assert.match(header, /marker line/)
  })

  test('it no longer runs git merge-file on the owner files', () => {
    assert.doesNotMatch(update, /merge-file/)
  })

  test('a migrated owner file is told to delete the old kit text below the marker by hand', () => {
    assert.match(update, /delete the kit text in it by hand/)
  })
})
