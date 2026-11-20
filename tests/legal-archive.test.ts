// The legal archive (card mwidrtw6jigffzbe5, subtask 2): the list of every version of a document, newest first, with the
// dates from the front matter (never the file names or file times), and each archived version readable as it was.
// Fixtures only. Pure. Run:
//   node --import tsx --test tests/legal-archive.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveList, archivedVersion } from '../shared/utils/legalArchive'
import { archivedLegalSources } from '../server/utils/legalPages'

const doc = (version: string, effective: string, status = 'published', body = `# Policy ${version}\n`) => [
  '---',
  'document: privacy',
  'title: Privacy Policy',
  `version: ${version}`,
  `effective: ${effective}`,
  `changed: ${effective}`,
  'language: en',
  `status: ${status}`,
  '---',
  body
].join('\n')

const current = doc('1.1.0', '2026-12-01')
// The archive file names are wrong on purpose: the dates must come from the front matter.
const archive = new Map([
  ['1.0.0_2026-11-15.md', doc('1.0.0', '2026-11-15')],
  ['1.0.1_2026-11-30.md', doc('1.0.1', '2026-11-30')]
])

test('the list has every version, newest first, and the current one first', () => {
  const list = archiveList(current, archive)
  assert.deepEqual(list.map(entry => entry.version), ['1.1.0', '1.0.1', '1.0.0'])
})

test('each entry says when it was in force and when it was replaced, from the front matter', () => {
  const [now, middle, first] = archiveList(current, archive)
  assert.deepEqual(now, { version: '1.1.0', effective: '2026-12-01', replacedOn: null, current: true })
  assert.equal(middle?.effective, '2026-11-30')
  assert.equal(middle?.replacedOn, '2026-12-01', 'replaced on the day the next version took effect')
  assert.equal(first?.effective, '2026-11-15')
  assert.equal(first?.replacedOn, '2026-11-30')
})

test('a file name that disagrees with the front matter does not change the dates', () => {
  const misnamed = new Map([['9.9.9_1999-01-01.md', doc('1.0.0', '2026-11-15')]])
  const [entry] = archiveList(current, misnamed).slice(-1)
  assert.equal(entry?.effective, '2026-11-15')
})

test('an archived draft is not listed: it was never in force', () => {
  const withDraft = new Map([...archive, ['0.9.0_2026-10-01.md', doc('0.9.0', '2026-10-01', 'draft')]])
  assert.equal(archiveList(current, withDraft).some(entry => entry.version === '0.9.0'), false)
})

test('an archived version reads as it was: its text, its dates, the document it belongs to', () => {
  const found = archivedVersion(archive, 'privacy', '1.0.0')
  assert.equal(found?.version, '1.0.0')
  assert.equal(found?.effective, '2026-11-15')
  assert.match(found?.body ?? '', /# Policy 1\.0\.0/)
})

test('the archive files of one document are read from the bundled keys; the current file and the other document are left out', async () => {
  const storage = {
    getKeys: async () => [
      'legal:privacy:archive:1.0.0_2026-11-15.md',
      'legal:privacy:current.md',
      'legal:imprint:archive:1.0.0_2026-11-15.md',
      'legal:privacy:archive:README.md'
    ],
    getItem: async (key: string) => `source of ${key}`
  }
  const files = await archivedLegalSources(storage, 'privacy')
  assert.deepEqual([...files.keys()], ['1.0.0_2026-11-15.md'])
  assert.equal(files.get('1.0.0_2026-11-15.md'), 'source of legal:privacy:archive:1.0.0_2026-11-15.md')
})

test('an unknown version, or a version of another document, is not found', () => {
  assert.equal(archivedVersion(archive, 'privacy', '7.7.7'), null)
  assert.equal(archivedVersion(archive, 'imprint', '1.0.0'), null)
})

test('the current version is not an archived version: the archive page links it, the archive does not hold it', () => {
  assert.equal(archivedVersion(archive, 'privacy', '1.1.0'), null)
})
