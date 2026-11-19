// Every bullet of a changelog fragment starts on its own line (CQ must 1, Nina on a05ef12): a bullet that follows a
// sentence on the same line is read as one line, and the fold copies it into CHANGELOG.md that way. Source level.
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const DIR = new URL('../changelog.d/', import.meta.url)

for (const name of readdirSync(DIR).filter(file => file.endsWith('.md'))) {
  test(`${name}: each bullet starts its own line`, () => {
    const lines = readFileSync(new URL(name, DIR), 'utf8').split('\n')
    lines.forEach((line, index) => {
      assert.doesNotMatch(line, /[.!?)`]- \*\*/, `line ${index + 1} joins two bullets: ${line.slice(0, 80)}`)
    })
  })
}
