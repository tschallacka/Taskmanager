// Every listening prompt keeps a background listener running while it waits (crew kit card mw95pybc1htu2pwssub). In each
// template, a section that tells its reader to run listen.mjs must also say to start the background listener
// (listen.mjs <you> 600, run_in_background), so the reader never waits without one. Source level, from the templates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = name => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

// The sections of a template: each starts at a Markdown heading.
function sectionsOf(text) {
  return text.split(/^#{1,3} /m).slice(1)
}

const TEMPLATES = ['PROMPTS.md.tmpl', 'NINA.md.tmpl', 'USHER.md.tmpl', 'RITA.md.tmpl']

test('the facts every prompt carries name the background listener first', () => {
  assert.match(read('PROMPTS.md.tmpl'), /Never be without a listener/)
})

for (const name of TEMPLATES) {
  test(`${name}: every section that runs listen.mjs also starts the background listener (600, run_in_background)`, () => {
    const listening = sectionsOf(read(name)).filter(section => /listen\.mjs/.test(section))
    assert.ok(listening.length > 0, `${name} has no listening section`)
    for (const section of listening) {
      const heading = section.split('\n')[0].slice(0, 60)
      assert.match(section, /listen\.mjs[^\n]*\b600\b|listen\.mjs <you> 600|listen\.mjs \w+ 600/, `no background listener in: ${heading}`)
      assert.match(section, /run_in_background/, `no run_in_background in: ${heading}`)
    }
  })
}

test('the Listening section of CREW.md names the background listener and says to keep exactly one running', () => {
  const crew = read('CREW.md.tmpl')
  const listening = sectionsOf(crew).find(section => /^Listening/.test(section))
  assert.ok(listening, 'no Listening section')
  assert.match(listening, /Never be without a listener/)
  assert.match(listening, /exactly one running/)
})
