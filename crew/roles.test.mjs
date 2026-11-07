// Tests for the five new roles (Susy, Janet, Pat, Tess, Rita): each is a cast member with an agent definition,
// has a stub template the kit ships, and has its name in the example config and in the server's crew people.
// Run from the repo root: node --test crew/roles.test.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CAST, forkMemberPlan } from './cast.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const REPO = join(KIT, '..')
const ROLES = { susy: 'SUSY', janet: 'JANET', pat: 'PAT', tess: 'TESS', rita: 'RITA' }
const NAMES = { susy: 'Susy Secretary', janet: 'Janet Janitor', pat: 'Pat Precheck', tess: 'Tess Triage', rita: 'Rita Reporter' }
const listed = readFileSync(join(KIT, 'kit-files.txt'), 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'))

test('the five roles are cast members, and init writes an agent definition for each', () => {
  for (const key of Object.keys(ROLES)) {
    assert.ok(CAST.includes(key), `${key} is in CAST`)
    assert.equal(forkMemberPlan(key), 'write', `${key} gets an agent definition`)
  }
})

test('each role has a stub template, and the kit ships it', () => {
  for (const [key, file] of Object.entries(ROLES)) {
    const template = `${file}.md.tmpl`
    assert.ok(existsSync(join(KIT, template)), `${template} exists for ${key}`)
    assert.ok(listed.includes(template), `${template} is listed in kit-files.txt`)
    const first = readFileSync(join(KIT, template), 'utf8').split('\n')[0]
    assert.equal(first, `# ${NAMES[key]}`, `${template} starts with its title`)
  }
})

test('the example config names each role, with its nick', () => {
  const example = JSON.parse(readFileSync(join(KIT, 'crew.config.example.json'), 'utf8'))
  for (const [key, name] of Object.entries(NAMES)) {
    assert.equal(example.people[key], name, `people.${key}`)
    assert.equal(example.nicks[key], key, `nicks.${key}`)
  }
})

test('the server knows the five people as crew members with the standard crew scopes', () => {
  const source = readFileSync(join(REPO, 'server', 'utils', 'crewProvisioning.ts'), 'utf8')
  for (const [key, name] of Object.entries(NAMES)) {
    assert.ok(source.includes(`{ key: '${key}', name: '${name}'`), `CREW_PEOPLE has ${key}`)
  }
  assert.ok(!source.includes('READ_ONLY_KEYS'), 'the new roles get CREW_SCOPES, like the other members')
})

test('Rita writes the status to Boss and the minutes, and the PM no longer does', () => {
  const rita = readFileSync(join(KIT, 'RITA.md.tmpl'), 'utf8')
  assert.match(rita, /post_status_update/, 'the hourly report is post_status_update to Boss')
  assert.match(rita, /on_track/)
  assert.match(rita, /meeting over/, 'the minutes follow "meeting over:"')
  assert.match(rita, /Secret-free/, 'her reports carry no credential')
  const prompts = readFileSync(join(KIT, 'PROMPTS.md.tmpl'), 'utf8')
  assert.ok(prompts.includes('## Reporter ('), 'the launch prompt has a Reporter section')
  const crew = readFileSync(join(KIT, 'CREW.md.tmpl'), 'utf8')
  assert.ok(!crew.includes('- **Status:** `post_status_update`'), 'the PM no longer posts the status')
  assert.ok(crew.includes('RITA.md'), 'CREW.md points at Rita for status and minutes')
})

test('the Rita figure is registered and gets her own look, not the placeholder', () => {
  const figures = readFileSync(join(REPO, 'app', 'office', 'figures', 'index.ts'), 'utf8')
  assert.match(figures, /rita: RITA_LOOK/, 'FIGURES names rita')
  assert.ok(existsSync(join(REPO, 'app', 'office', 'figures', 'rita.ts')), 'the figure file exists')
})
