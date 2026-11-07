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

test('Pat has her checklist: the five checks, one PRECHECK verdict, and the two tags she sets', () => {
  const pat = readFileSync(join(KIT, 'PAT.md.tmpl'), 'utf8')
  assert.ok(pat.includes('PRECHECK: pass') && pat.includes('PRECHECK: fail'), 'both verdicts are written out')
  assert.ok(pat.includes('`PM approved`') && pat.includes('`PM violation`'), 'the tags she sets are named')
  assert.match(pat, /Acceptance criteria/)
  assert.match(pat, /Screenshot/)
  const cross = readFileSync(join(KIT, 'CREW.md.tmpl'), 'utf8')
  assert.ok(cross.includes('| `PM approved` |') && cross.includes('| `PM violation` |'), 'the tag table lists both tags')
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

// Pia's text (the PM's job, her launch prompt, her UX file, the skill's roles) no longer carries the duties the
// other roles and the server took over, and each duty names its owner.
const section = (text, from, to) => {
  const start = text.indexOf(from)
  assert.ok(start >= 0, `"${from}" is in the file`)
  const end = to ? text.indexOf(to, start + from.length) : text.length
  return text.slice(start, end)
}
const MOVED = [
  /pre-check Verify tasks/i,
  /Promote Backlog tasks/,
  /the PM assigns each bug/i,
  /triage the tester/i,
  /gets 15 minutes from you/,
  /the PM checks it and moves it to \*\*Done\*\*/,
  /post_status_update/,
  /the PM moves it to \*\*Verify\*\*/,
  /pre-check Verify,/
]

test('Pia\'s PM section drops the moved duties and names their owners', () => {
  const crew = readFileSync(join(KIT, 'CREW.md.tmpl'), 'utf8')
  const pm = section(crew, '## The PM\'s job', '## Worker round')
  for (const bad of MOVED) assert.doesNotMatch(pm, bad, `PM section does not say ${bad}`)
  for (const owner of ['{{people.pat}}', '{{people.tess}}', '{{people.rita}}', '{{people.janet}}', '{{people.susy}}']) {
    assert.ok(pm.includes(owner), `PM section names ${owner}`)
  }
  assert.match(pm, /Round 1/, 'planning stays with Pia')
  assert.match(pm, /QUESTION:/, 'answering questions stays with Pia')
})

test('the rules of the road name Pat for the gate, Tess for bugs and the server for the routing', () => {
  const crew = readFileSync(join(KIT, 'CREW.md.tmpl'), 'utf8')
  assert.ok(crew.includes('{{people.pat}} pre-checks it'), 'rule 7: Pat pre-checks Verify PM')
  assert.ok(crew.includes('the server routes'), 'rule 7: the server routes the gates')
  assert.ok(crew.includes('{{people.tess}} triages each bug'), 'rule 9: Tess triages bugs')
  assert.ok(crew.includes('the server posts a note to the PM at 15 minutes'), 'rule 6b: the server runs the test clock')
  assert.match(crew, /a\s+poke is never a reason to start anyone/, 'Susy pokes, Pia still starts people')
})

test('Pia\'s launch prompt and UX file drop the triage and the pre-check', () => {
  const prompts = readFileSync(join(KIT, 'PROMPTS.md.tmpl'), 'utf8')
  const pm = section(prompts, '## PM (', '## Worker (')
  for (const bad of MOVED) assert.doesNotMatch(pm, bad, `PM prompt does not say ${bad}`)
  assert.ok(pm.includes('{{people.tess}}') && pm.includes('{{people.rita}}'), 'PM prompt names Tess and Rita')
  const ux = readFileSync(join(KIT, 'PIA-UX.md.tmpl'), 'utf8')
  assert.doesNotMatch(ux, /^## Triage/m, 'the UX file has no triage steps any more')
  assert.ok(ux.includes('{{people.tess}} triages them'), 'the UX file names Tess as the triager')
})

test('the skill names who has each duty now', () => {
  const skill = readFileSync(join(KIT, 'SKILL.md'), 'utf8')
  const pia = skill.split('\n').find(line => line.startsWith('| `pia` |')) ?? ''
  assert.ok(pia && !/pre-check|triage/i.test(pia), 'the pia row names no pre-check or triage')
  assert.ok(skill.includes('Pat (`pat`) pre-checks it'), 'the board section names Pat')
  assert.ok(skill.includes('Tess triages'), 'the bugs and findings name Tess')
})
