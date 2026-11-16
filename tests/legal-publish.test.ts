// The legal pages (card mwidrtw6jigffzbe5, subtask 1): the front matter of a legal document is read, and a document
// that is a draft, or still holds an open [[...]] placeholder, is never published: its page answers 404 and one line
// goes to the log. The tests use fixture documents only, never the real legal/ files. Pure. Run:
//   node --import tsx --test tests/legal-publish.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLegalDoc, publishBlocker } from '../shared/utils/legalDocs'
import { currentLegalSources, legalPage } from '../server/utils/legalPages'

const front = (fields: Record<string, string>) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`
const base = {
  document: 'privacy',
  title: 'Privacy Policy',
  version: '1.0.0',
  effective: '2026-11-15',
  changed: '2026-11-15',
  language: 'en',
  status: 'published'
}
const doc = (fields: Partial<typeof base> = {}, body = '# Policy\n\nWe keep it short.\n') => front({ ...base, ...fields }) + body

test('the front matter and the body are read', () => {
  const parsed = parseLegalDoc(doc({}, '# Policy\n\nText.\n'))
  assert.equal(parsed.document, 'privacy')
  assert.equal(parsed.title, 'Privacy Policy')
  assert.equal(parsed.version, '1.0.0')
  assert.equal(parsed.effective, '2026-11-15')
  assert.equal(parsed.changed, '2026-11-15')
  assert.equal(parsed.language, 'en')
  assert.equal(parsed.status, 'published')
  assert.equal(parsed.body.trim(), '# Policy\n\nText.')
  assert.deepEqual(parsed.placeholders, [])
})

test('a missing front-matter field is an error that names the field', () => {
  const source = front({ ...base, version: '' }).replace('version: \n', '') + '# x\n'
  assert.throws(() => parseLegalDoc(source), /version/)
})

test('a document with no front matter is an error', () => {
  assert.throws(() => parseLegalDoc('# Policy\n'), /front matter/)
})

test('a published document with no placeholder may be published', () => {
  assert.equal(publishBlocker(parseLegalDoc(doc())), null)
})

test('a draft is never published', () => {
  assert.equal(publishBlocker(parseLegalDoc(doc({ status: 'draft' }))), 'status is draft')
})

test('an open placeholder blocks publishing, and names it', () => {
  const parsed = parseLegalDoc(doc({}, '# Policy\n\nSent to [[EMAIL-SERVICE: name of the service]].\n'))
  assert.deepEqual(parsed.placeholders, ['EMAIL-SERVICE: name of the service'])
  assert.match(publishBlocker(parsed) ?? '', /placeholders: EMAIL-SERVICE/)
})

test('a placeholder in a draft is reported as the draft, and the placeholder is still named', () => {
  const blocker = publishBlocker(parseLegalDoc(doc({ status: 'draft' }, 'See [[HOST]].\n')))
  assert.match(blocker ?? '', /draft/)
})

test('the page for a publishable document gives the document', () => {
  const log: string[] = []
  const result = legalPage(new Map([['privacy', doc()]]), 'privacy', line => log.push(line))
  assert.equal(result.status, 200)
  assert.equal(result.status === 200 && result.doc.version, '1.0.0')
  assert.deepEqual(log, [])
})

test('a draft answers 404 and logs one line naming the document and the reason', () => {
  const log: string[] = []
  const result = legalPage(new Map([['privacy', doc({ status: 'draft' })]]), 'privacy', line => log.push(line))
  assert.equal(result.status, 404)
  assert.equal(log.length, 1)
  assert.match(log[0]!, /privacy.*status is draft/)
})

test('a document with a placeholder answers 404 and logs the placeholder', () => {
  const log: string[] = []
  const result = legalPage(new Map([['imprint', doc({ document: 'imprint' }, '[[HOST: name]]\n')]]), 'imprint', line => log.push(line))
  assert.equal(result.status, 404)
  assert.match(log[0] ?? '', /imprint.*placeholders: HOST/)
})

test('the current documents are read from the bundled legal folder, by their path, and the archive is left out', async () => {
  const storage = {
    getKeys: async () => ['legal:privacy:current.md', 'legal:privacy:archive:1.0.0_2026-11-15.md', 'legal:imprint:current.md', 'legal:README.md'],
    getItem: async (key: string) => `source of ${key}`
  }
  const files = await currentLegalSources(storage)
  assert.deepEqual([...files.keys()].sort(), ['imprint', 'privacy'])
  assert.equal(files.get('privacy'), 'source of legal:privacy:current.md')
})

test('a missing document answers 404 and logs nothing (there is no page to refuse)', () => {
  const log: string[] = []
  assert.equal(legalPage(new Map(), 'privacy', line => log.push(line)).status, 404)
  assert.deepEqual(log, [])
})
