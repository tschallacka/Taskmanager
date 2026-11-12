// Deleting one attachment of a task: only the named file goes, the count drops by one, and the limit message says how
// many there are and how to free one. Written, not run yet.
// Run: node --import tsx --test tests/task-attachment-delete.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SAFE_FILENAME, attachmentLimitMessage, deleteTaskAttachment, countAttachments } from '../server/utils/attachments.ts'

function folderWith(names: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'attach-delete-'))
  mkdirSync(dir, { recursive: true })
  for (const name of names) writeFileSync(join(dir, name), 'x')
  return dir
}

test('deleting one attachment removes only that file and the count drops by one', () => {
  const dir = folderWith(['a1.png', 'b2.jpg', 'c3.gif'])
  try {
    assert.equal(countAttachments(dir), 3)
    assert.equal(deleteTaskAttachment(dir, 'b2.jpg'), true)
    assert.deepEqual(readdirSync(dir).sort(), ['a1.png', 'c3.gif'])
    assert.equal(countAttachments(dir), 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a name that is not in the folder is reported as not removed, and nothing else goes', () => {
  const dir = folderWith(['a1.png'])
  try {
    assert.equal(deleteTaskAttachment(dir, 'missing9.png'), false)
    assert.deepEqual(readdirSync(dir), ['a1.png'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('only plain stored names pass the name rule; a path or a traversal is refused', () => {
  assert.equal(SAFE_FILENAME.test('ab12cd.png'), true)
  assert.equal(SAFE_FILENAME.test('../ab12cd.png'), false)
  assert.equal(SAFE_FILENAME.test('folder/ab12cd.png'), false)
  assert.equal(SAFE_FILENAME.test('..'), false)
  assert.equal(SAFE_FILENAME.test('ab12cd.png.exe'), false)
})

test('a full task says how many there are and how to free one', () => {
  assert.equal(attachmentLimitMessage(15), '15 of 15 attachments: delete one first')
})
