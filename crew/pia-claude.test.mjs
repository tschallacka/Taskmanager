// Pia's standing order (her session's CLAUDE.md) is written by init from the kit's template, once. An existing file is the
// owner's edit and init keeps it byte for byte. Run: node --test crew/pia-claude.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const SCRATCH = mkdtempSync(join(tmpdir(), 'pia-claude-'))
const made = [SCRATCH]
process.on('exit', () => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

function crewIn(home) {
  const dir = join(home, 'crew-home', 'acme')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'crew.json'), JSON.stringify({ team: 'Acme Crew', crew: { slug: 'acme' }, board: { url: 'http://127.0.0.1:9' } }))
  return dir
}

// The crew home comes from CREW_HOME, as the kit reads it; "~" is the throwaway home.
const run = (home, ...args) => spawnSync(process.execPath, [join(KIT, 'init.mjs'), ...args], {
  cwd: home,
  encoding: 'utf8',
  env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', CREW_HOME: '~/crew-home/acme' }
})

test('the kit documents do not carry an authority default: no Boss rule in CREW.md or PROMPTS.md', () => {
  // The owner's standing order lives in this crew's own pia-session/CLAUDE.md, outside the kit.
  for (const doc of ['CREW.md.tmpl', 'PROMPTS.md.tmpl']) {
    assert.equal(readFileSync(join(KIT, doc), 'utf8').includes('Boss directs Pia'), false, `${doc} carries no Boss rule`)
  }
})

test('the template is mechanics only: no authority grant, no script paths, no person names', () => {
  const text = readFileSync(join(KIT, 'PIA-CLAUDE.md.tmpl'), 'utf8')
  assert.equal(/ALWAYS/.test(text), false, 'no authority grant in the template')
  assert.equal(/\.mjs|\.sh|bin\/|\/srv\//.test(text), false, 'no script paths in the template')
  assert.equal(/Cato|Fable|Casey|Pia Planner|Boss idle watch|mailbox\.mjs/.test(text), false, 'no names or scripts')
  assert.match(text, /<!-- owner standing orders below this line -->/, 'the marker line is there')
})

test('init on an empty home writes Pia\'s CLAUDE.md from the template', () => {
  const home = mkdtempSync(join(SCRATCH, 'home-'))
  const dir = crewIn(home)
  run(home)
  const file = join(dir, 'pia-session', 'CLAUDE.md')
  assert.equal(existsSync(file), true, 'the file is written')
  const text = readFileSync(file, 'utf8')
  assert.match(text, /owner standing orders below this line/)
  assert.equal(/\{\{[^}]+\}\}/.test(text), false, 'every placeholder is filled')
})

test('init on a home with an edited CLAUDE.md keeps that copy byte for byte', () => {
  const home = mkdtempSync(join(SCRATCH, 'home-'))
  const dir = crewIn(home)
  mkdirSync(join(dir, 'pia-session'), { recursive: true })
  const edited = Buffer.from('# my own order\n\nBoss first. Keep this exactly.\n\xff\x00 odd bytes stay\n')
  writeFileSync(join(dir, 'pia-session', 'CLAUDE.md'), edited)
  run(home)
  assert.deepEqual(readFileSync(join(dir, 'pia-session', 'CLAUDE.md')), edited)
})
