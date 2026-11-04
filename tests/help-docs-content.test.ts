// The real pages in docs/: every one parses, says what it is for, and every link to another help page
// lands on a page that exists. Needs nothing but the files. Run:
//   node --import tsx --test tests/help-docs-content.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseHelpDoc, withImplied } from '../shared/utils/helpDocs'

const DOCS = join(import.meta.dirname, '..', 'docs')

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? markdownFiles(path) : name.endsWith('.md') ? [path] : []
  })
}

// The folder's README is for people reading the repository, not a help page.
const files = markdownFiles(DOCS).filter(path => relative(DOCS, path).toLowerCase() !== 'readme.md')
const docs = files.map((path) => {
  const slug = relative(DOCS, path).replace(/\\/g, '/').replace(/\.md$/, '')
  return { slug, source: readFileSync(path, 'utf8') }
})

test('there are help pages', () => {
  assert.ok(docs.length > 0, 'docs/ has no pages')
})

test('every page parses, with a title, a summary and topics', () => {
  for (const { slug, source } of docs) {
    const page = parseHelpDoc(slug, source)
    assert.ok(page.summary.length >= 10, `docs/${slug}.md needs a summary of what the page is for`)
    assert.ok(page.topics.length >= 2, `docs/${slug}.md needs topics (a comma list of words people search for)`)
    assert.ok(page.body.trim().length >= 200, `docs/${slug}.md is nearly empty`)
  }
})

test('every link to another help page lands on a page that exists', () => {
  const slugs = new Set(docs.map(doc => doc.slug))
  for (const { slug, source } of docs) {
    for (const match of source.matchAll(/\]\(\/help\/([^)#\s]+)(?:#[^)]*)?\)/g)) {
      assert.ok(slugs.has(match[1]!), `docs/${slug}.md links to /help/${match[1]}, which is not a page`)
    }
  }
})

test('a page does not carry a link that only an admin could follow into a page for everyone', () => {
  // A page anyone may read must not point at a page they may not: the link would be a door that says "not found".
  const parsed = new Map(docs.map(doc => [doc.slug, parseHelpDoc(doc.slug, doc.source)]))
  for (const [slug, page] of parsed) {
    for (const match of page.body.matchAll(/\]\(\/help\/([^)#\s]+)/g)) {
      const target = parsed.get(match[1]!)
      if (!target) continue
      // Whoever may read this page already holds what its permissions imply: an admin is staff.
      const held = withImplied(page.requires)
      const missing = target.requires.filter(permission => !held.has(permission))
      // A link inside a <!-- requires --> section is fine: the section already holds that permission.
      const before = page.body.slice(0, match.index)
      const insideSection = (before.match(/<!--\s*requires:/g) ?? []).length > (before.match(/<!--\s*\/requires/g) ?? []).length
      if (missing.length && !insideSection) {
        assert.fail(`docs/${slug}.md links to /help/${match[1]}, which needs ${missing.join(', ')}; put the link in a <!-- requires: ${missing.join(', ')} --> section`)
      }
    }
  }
})
