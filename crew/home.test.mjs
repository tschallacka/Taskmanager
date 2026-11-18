// The shared slug and session-name rule (home.mjs), and a drift guard: config.mjs and session.mjs must use it, not a copy.
// Run: cd crew && node --test home.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slugify, crewSlugOf, sessionNameFor } from './home.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const source = name => readFileSync(join(HERE, name), 'utf8')

test('slugify lower-cases and turns every run of other characters into one dash', () => {
  assert.equal(slugify('Taskmanager Maintenance'), 'taskmanager-maintenance')
  assert.equal(slugify('  Acme  Team!! '), 'acme-team')
  assert.equal(slugify(''), '')
})

test('crewSlugOf uses the crew slug, else the team name, else nothing', () => {
  assert.equal(crewSlugOf({ team: 'Taskmanager Maintenance', crew: { slug: 'acme-crew' } }), 'acme-crew')
  assert.equal(crewSlugOf({ team: 'Taskmanager Maintenance' }), 'taskmanager-maintenance')
  assert.equal(crewSlugOf({}), '')
})

test('sessionNameFor joins the slug and the key with a dash; no slug gives the key alone', () => {
  assert.equal(sessionNameFor('taskmanager-maintenance', 'wren'), 'taskmanager-maintenance-wren')
  assert.equal(sessionNameFor('', 'wren'), 'wren')
})

test('config.mjs and session.mjs take the slug and the session name from home.mjs, not from a copy', () => {
  for (const file of ['config.mjs', 'session.mjs']) {
    const text = source(file)
    assert.ok(text.includes('from \'./home.mjs\''), `${file} imports home.mjs`)
    assert.ok(!text.includes('[^a-z0-9]+'), `${file} has no copy of the slug rule`)
  }
  assert.match(source('config.mjs'), /sessionNameFor\(/, 'config names sessions with sessionNameFor')
  assert.match(source('session.mjs'), /sessionNameFor\(/, 'session names sessions with sessionNameFor')
})
