// The invite page's footnote: without a name, a small grey line under the button says 'Invitation for <email>'. The
// email is shown only there, not in a separate sentence (owner's wording, card mwiccy1tk8kygw7lc5). Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/invite/[token].vue', import.meta.url), 'utf8')

test('the page takes the footnote from the sentence builder, with the invitation address', () => {
  const words = page.slice(page.indexOf('const words = computed('), page.indexOf('// The registration form is the default'))
  assert.match(words, /email: invite\.email \?\? ''/)
})

test('the footnote is a grey line under the button, from words.footnote', () => {
  assert.match(page, /<p\s+v-if="words\?\.footnote"[^>]*text-muted[^>]*>\s*\{\{ words\.footnote \}\}\s*<\/p>/)
})

test('the old sentence that repeated the email is gone', () => {
  assert.equal(page.includes('This invitation is for'), false)
})
