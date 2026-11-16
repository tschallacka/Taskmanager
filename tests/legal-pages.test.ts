// The /privacy and /imprint pages and their API (card mwidrtw6jigffzbe5, subtask 1): both public, both read the bundled
// legal documents through the same refusal rule, and both show the version and the dates at the top. Source-level, so
// no server runs. Run:
//   node --import tsx --test tests/legal-pages.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

test('the public legal API answers one document, through the publish rule, and 404s anything else', () => {
  const api = read('server/api/legal/[doc].get.ts')
  assert.match(api, /legalPage\(/)
  assert.match(api, /LEGAL_DOCUMENTS/)
  assert.match(api, /statusCode: 404/)
})

test('the documents are bundled into the server build, like the help pages', () => {
  const config = read('nuxt.config.ts')
  assert.match(config, /baseName: 'legal'/)
  assert.match(config, /\.\/legal/)
})

test('the archive is served by its own API routes, and the archive pages exist for both documents', () => {
  assert.match(read('server/api/legal/[doc]/archive.get.ts'), /archiveList\(/)
  assert.match(read('server/api/legal/[doc]/archive/[version].get.ts'), /archivedVersion\(/)
  for (const doc of ['privacy', 'imprint']) {
    assert.match(read(`app/pages/${doc}/archive/index.vue`), /LegalArchivePage/)
    assert.match(read(`app/pages/${doc}/archive/[version].vue`), /LegalDocumentPage/)
  }
  assert.match(read('app/components/LegalArchivePage.vue'), /\/archive/)
})

// One component draws either document; each page names its document.
test('the shared legal page reads its document from the API and shows the version and dates at the top', () => {
  const vue = read('app/components/LegalDocumentPage.vue')
  assert.match(vue, /\/api\/legal\//)
  assert.match(vue, /Version /)
  assert.match(vue, /In force from /)
  assert.match(vue, /Last changed /)
  assert.match(vue, /sanitizeHtml\(markdownToHtml\(/)
})

for (const [page, document] of [['privacy', 'privacy'], ['imprint', 'imprint']] as const) {
  test(`/${page} is the ${document} document, with no sign-in needed`, () => {
    const vue = read(`app/pages/${page}/index.vue`)
    assert.match(vue, new RegExp(`name="${document}"`))
    assert.match(vue, /LegalDocumentPage/)
    assert.match(vue, /middleware: \[\]/)
  })
}
