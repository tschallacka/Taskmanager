// The four tester templates say how to use the tester copy (card mwc6mh6h2kwx7hb69ry, step 2): a tester starts its own copy of
// the card's branch with tester-copy.sh, uses the URL the start prints, stops it when done, and never asks a worker to serve
// a copy. Read as text, like roles.test.mjs. Run from the repo root: node --test crew/tester-templates.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const read = file => readFileSync(join(KIT, file), 'utf8')
const TESTERS = { quincy: 'QUINCY.md.tmpl', usher: 'USHER.md.tmpl', pat: 'PAT.md.tmpl', nina: 'NINA.md.tmpl' }

test('each tester template starts its own copy with tester-copy.sh, for its own key and the card branch', () => {
  for (const [key, file] of Object.entries(TESTERS)) {
    const text = read(file)
    assert.match(text, new RegExp(`\\{\\{node_kit\\}\\}/tester-copy\\.sh start ${key} <branch`), `${file} starts ${key}'s copy`)
  }
})

test('each tester template stops its copy when done, with its own key', () => {
  for (const [key, file] of Object.entries(TESTERS)) {
    assert.match(read(file), new RegExp(`tester-copy\\.sh stop ${key}\\b`), `${file} stops ${key}'s copy`)
  }
})

test('each tester template uses the URL the start prints, not the dev copy of the owner or a port written in', () => {
  for (const file of Object.values(TESTERS)) {
    const text = read(file)
    assert.doesNotMatch(text, /dev copy is at \{\{product\.appUrl\}\}/, `${file} names no shared dev copy`)
    assert.doesNotMatch(text, /localhost:31\d\d/, `${file} writes no tester port`)
    assert.match(text, /URL the start prints/, `${file} takes the URL from the start`)
  }
})

test('each tester template says a tester never asks a worker to serve a copy', () => {
  for (const file of Object.values(TESTERS)) {
    assert.match(read(file), /never asks? a worker to (serve|start) a copy/, `${file} says it`)
  }
})
