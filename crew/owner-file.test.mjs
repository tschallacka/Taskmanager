// Tests for the marker line in the owner documents (PROJECT-RULES.md, BRIEF.md, JANET.md): the text above the marker is
// kit text and is replaced on each update; the text below is the project's and is kept byte for byte. Pure: no files, no
// network. Run from the repo root: node --test crew/owner-file.test.mjs
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MARKER, splitOwnerFile, updateOwnerFile } from './owner-file.mjs'

const NEW_TEMPLATE = '# Rules\n\nKit rule two.\n\n' + MARKER + '\n'
const OLD_TEMPLATE = '# Rules\n\nKit rule one.\n'

describe('the marker line', () => {
  test('the marker is an HTML comment that names the split, so a reader of the file sees where their text goes', () => {
    assert.match(MARKER, /^<!-- crew:project-rules below this line: yours/)
    assert.match(MARKER, /the kit never changes anything after it -->$/)
  })

  test('splitOwnerFile separates the kit text above the marker from the project text below it', () => {
    const file = '# Rules\n\nKit.\n\n' + MARKER + '\n\nOur command: bun test\n'
    assert.deepEqual(splitOwnerFile(file), {
      kit: '# Rules\n\nKit.\n\n' + MARKER + '\n',
      own: '\nOur command: bun test\n'
    })
  })

  test('a file without the marker has no split', () => {
    assert.equal(splitOwnerFile(OLD_TEMPLATE), null)
  })
})

describe('updateOwnerFile', () => {
  test('an update keeps the project text below the marker exactly, and takes the new kit text above it', () => {
    const current = '# Rules\n\nKit rule one.\n\n' + MARKER + '\n\nOur command: bun test\n  (indented, with a trailing space )  \n'
    const updated = updateOwnerFile(current, NEW_TEMPLATE)
    assert.equal(updated.status, 'updated')
    assert.equal(updated.text, '# Rules\n\nKit rule two.\n\n' + MARKER + '\n\nOur command: bun test\n  (indented, with a trailing space )  \n')
  })

  test('the project text below the marker is never read or merged: a line that the new kit text also has stays once, below', () => {
    const current = '# Rules\n\nKit rule one.\n\n' + MARKER + '\nKit rule two.\n'
    const updated = updateOwnerFile(current, NEW_TEMPLATE)
    assert.equal(updated.text, '# Rules\n\nKit rule two.\n\n' + MARKER + '\nKit rule two.\n')
  })

  test('a file that matches the new template is already up to date, and nothing changes', () => {
    const updated = updateOwnerFile(NEW_TEMPLATE, NEW_TEMPLATE)
    assert.equal(updated.status, 'unchanged')
    assert.equal(updated.text, NEW_TEMPLATE)
  })

  test('a file without the marker is migrated once: the new kit text above a new marker, and the old content kept entirely below', () => {
    const current = '# Rules\n\nKit rule one.\nOur command: bun test\n'
    const updated = updateOwnerFile(current, NEW_TEMPLATE)
    assert.equal(updated.status, 'migrated')
    assert.equal(updated.text, '# Rules\n\nKit rule two.\n\n' + MARKER + '\n' + current)
    assert.equal(updated.text.includes(current), true, 'nothing lost: the old file is intact below the marker')
  })

  test('a migrated file has the marker now, so the next update is a plain update and never a migration', () => {
    const migrated = updateOwnerFile('# Rules\n\nKit rule one.\nOur command: bun test\n', NEW_TEMPLATE).text
    const again = updateOwnerFile(migrated, NEW_TEMPLATE)
    assert.notEqual(again.status, 'migrated')
    assert.equal(again.text, migrated)
  })

  test('the kit text above the marker is replaced even when the project edited it: that is the kit part, not the project part', () => {
    const current = '# Rules\n\nKit rule one, edited by hand.\n\n' + MARKER + '\n\nOur command: bun test\n'
    const updated = updateOwnerFile(current, NEW_TEMPLATE)
    assert.equal(updated.text, '# Rules\n\nKit rule two.\n\n' + MARKER + '\n\nOur command: bun test\n')
  })
})
