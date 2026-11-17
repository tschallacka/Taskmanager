// The trust of the crew's own folders in Claude Code's config file (crew/claude-trust.mjs, card mwk8koh1xf1jikjrkff). Tests run on a
// fake config file in a temp folder: nothing touches the real ~/.claude.json. Approved answers: one backup, never overwritten; the
// file is CLAUDE_CONFIG_DIR/.claude.json when that variable is set, else HOME/.claude.json; a changed file is re-read and the change
// redone, up to three tries, then nothing is written.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureTrusted, configFile } from './claude-trust.mjs'

function fakeConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), 'claude-trust-'))
  const file = join(dir, '.claude.json')
  writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 })
  return file
}

const CREW = '/srv/crew/home'
const KIT = '/srv/crew/kit'
const SESSION = '/srv/crew/work/wick'

test('adds trust only for the given paths, and keeps every other key and every other project', () => {
  const file = fakeConfig({
    numStartups: 7,
    theme: 'dark',
    projects: { '/other/repo': { hasTrustDialogAccepted: true, allowedTools: ['Bash'] }, [SESSION]: { lastCost: 1.5 } }
  })
  const res = ensureTrusted([CREW, KIT, SESSION], { file })
  assert.equal(res.ok, true)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.numStartups, 7)
  assert.equal(after.theme, 'dark')
  assert.deepEqual(after.projects['/other/repo'], { hasTrustDialogAccepted: true, allowedTools: ['Bash'] }, 'another project is untouched')
  assert.equal(after.projects[CREW].hasTrustDialogAccepted, true)
  assert.equal(after.projects[KIT].hasTrustDialogAccepted, true)
  assert.equal(after.projects[SESSION].hasTrustDialogAccepted, true)
  assert.equal(after.projects[SESSION].lastCost, 1.5, 'the rest of an entry we trust is kept')
})

test('a path it was not given is never written', () => {
  const file = fakeConfig({ projects: {} })
  ensureTrusted([CREW], { file })
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(after.projects), [CREW])
})

test('idempotent: a second call with the same paths changes nothing and writes nothing', () => {
  const file = fakeConfig({ projects: {} })
  ensureTrusted([CREW, KIT], { file })
  const first = readFileSync(file, 'utf8')
  const res = ensureTrusted([CREW, KIT], { file })
  assert.equal(res.ok, true)
  assert.deepEqual(res.changed, [], 'nothing changed the second time')
  assert.equal(readFileSync(file, 'utf8'), first)
})

test('one backup is made before the first change, and is never overwritten', () => {
  const original = `${JSON.stringify({ projects: {}, keep: 'original' }, null, 2)}\n`
  const file = fakeConfig(original)
  ensureTrusted([CREW], { file })
  const backup = `${file}.crew-backup`
  assert.equal(readFileSync(backup, 'utf8'), original, 'the backup is the file as it was')
  writeFileSync(file, `${JSON.stringify({ projects: {}, keep: 'later' })}\n`)
  ensureTrusted([KIT], { file })
  assert.equal(readFileSync(backup, 'utf8'), original, 'the second call does not overwrite the backup')
})

test('an invalid JSON file is refused with a sentence, and nothing is written or backed up', () => {
  const broken = '{ "projects": { "x": '
  const file = fakeConfig(broken)
  const res = ensureTrusted([CREW], { file })
  assert.equal(res.ok, false)
  assert.match(res.reason, /not valid JSON/)
  assert.match(res.reason, /nothing was written/)
  assert.equal(readFileSync(file, 'utf8'), broken)
  assert.equal(existsSync(`${file}.crew-backup`), false)
})

test('the file mode stays 600', () => {
  const file = fakeConfig({ projects: {} })
  ensureTrusted([CREW], { file })
  assert.equal(statSync(file).mode & 0o777, 0o600)
})

test('a relative path is refused, and nothing is written', () => {
  const file = fakeConfig({ projects: {} })
  const res = ensureTrusted(['relative/path'], { file })
  assert.equal(res.ok, false)
  assert.match(res.reason, /absolute path/)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).projects[ 'relative/path'], undefined)
})

test('a file that changes between the read and the write is re-read and the change redone; after three changes nothing is written', () => {
  // Claude Code writes the same file while crew works: each time we are about to rename, the file changes once more.
  const file = fakeConfig({ projects: {}, n: 0 })
  let changes = 0
  const race = () => {
    changes += 1
    const now = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, `${JSON.stringify({ ...now, n: now.n + 1 })}\n`)
  }
  const res = ensureTrusted([CREW], { file, beforeRename: race })
  assert.equal(res.ok, false, 'three changes in a row give up')
  assert.match(res.reason, /changed while crew update was writing it/)
  assert.equal(changes, 3)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.projects[CREW], undefined, 'our change was not written')
  assert.equal(after.n, 3, 'the other writer’s changes are kept')
})

test('a single change in between is retried, and the trust is written on the second try', () => {
  const file = fakeConfig({ projects: {}, n: 0 })
  let once = true
  const race = () => {
    if (!once) return
    once = false
    const now = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, `${JSON.stringify({ ...now, n: 9 })}\n`)
  }
  const res = ensureTrusted([CREW], { file, beforeRename: race })
  assert.equal(res.ok, true)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.projects[CREW].hasTrustDialogAccepted, true)
  assert.equal(after.n, 9, 'the other writer’s change is kept')
})

test('the config file is CLAUDE_CONFIG_DIR/.claude.json when the variable is set, else HOME/.claude.json', () => {
  assert.equal(configFile({ CLAUDE_CONFIG_DIR: '/cfg' }, '/home/u'), '/cfg/.claude.json')
  assert.equal(configFile({}, '/home/u'), '/home/u/.claude.json')
  assert.equal(configFile({ CLAUDE_CONFIG_DIR: '' }, '/home/u'), '/home/u/.claude.json')
})
