// At 390 px the Customers popup cut each customer's name to 'Scratch ...' with the counts on the same line, so the rows
// could not be told apart (Usher's finding, card mwkub0feszrliq1vje8). The name wraps onto two lines when it must, and the
// counts go under it. Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/CustomersModal.vue', import.meta.url), 'utf8')
const start = source.indexOf('{{ c.name }}')
const row = source.slice(source.lastIndexOf('<button', start), source.indexOf('</button>', start) + 9)
const nameTag = row.slice(row.lastIndexOf('<span', row.indexOf('{{ c.name }}')), row.indexOf('{{ c.name }}'))
const countsTag = row.slice(row.lastIndexOf('<span', row.indexOf('projectCount')), row.indexOf('projectCount'))

test('the customer name is not cut with an ellipsis and may break', () => {
  assert.ok(nameTag.length > 0)
  assert.equal(/\btruncate\b/.test(nameTag), false)
  assert.match(nameTag, /\bbreak-words\b/)
})

test('the row button wraps, so the counts go under a long name at phone width', () => {
  assert.match(row.slice(0, row.indexOf('>')), /\bflex-wrap\b/)
})

test('the counts line is not forced onto one line', () => {
  assert.equal(/\bwhitespace-nowrap\b/.test(countsTag), false)
})
