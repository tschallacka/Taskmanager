// Tests for `crew update`: the instance record of a kit folder, the refusal for a kit of another instance, and
// `crew update --all`. Temp folders only, no network: every run passes --from a copy of this kit.
// Run from the repo root: node --test crew/update.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const UPDATE = join(KIT, 'update.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'crew-update-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// A crew home with a crew.json for a board on 127.0.0.1 port 1 (never answers: these tests never fetch).
function makeHome(name, boardUrl = 'http://127.0.0.1:1') {
  const home = join(scratch, name)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'crew.json'), JSON.stringify({
    team: 'Team',
    product: { name: 'Product', repo: '' },
    board: { url: boardUrl },
    crew: { slug: name }
  }))
  return home
}

// A copy of this kit's shipped files (no tests), so an update can run against a folder that is not the repo's.
function copyKit(name) {
  const dir = join(scratch, name)
  cpSync(KIT, dir, { recursive: true, filter: source => !/\.test\.mjs$/.test(source) })
  return dir
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [UPDATE, ...args], {
    encoding: 'utf8',
    // The agent definitions and skills init writes go to the scratch folder, never to the real ~/.claude.
    env: { ...process.env, CLAUDE_CONFIG_DIR: join(scratch, 'claude'), XDG_CONFIG_HOME: join(scratch, 'xdg'), ...env }
  })
}

describe('crew update: the kit folder belongs to one instance', () => {
  test('an update from a kit of the same instance records the instance in the kit folder', () => {
    const target = copyKit('kit-same')
    const home = makeHome('home-same')
    const result = run(['--from', KIT, '--kit', target], { CREW_HOME: home })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /is up to date/)
    const record = JSON.parse(readFileSync(join(target, 'kit-instance.json'), 'utf8'))
    assert.equal(record.host, '127.0.0.1:1')
    assert.ok(record.version !== undefined, 'the record names the version it holds')
  })

  test('a kit folder of another instance is refused with one sentence, and nothing is changed', () => {
    const target = copyKit('kit-foreign')
    writeFileSync(join(target, 'kit-instance.json'), JSON.stringify({ host: 'taskmanager.localhost', version: '0.1.0' }))
    const home = makeHome('home-foreign')
    const result = run(['--from', KIT, '--kit', target], { CREW_HOME: home })
    assert.equal(result.status, 3)
    assert.match(result.stderr, /this kit belongs to taskmanager\.localhost, and this crew talks to 127\.0\.0\.1:1\./)
    assert.match(result.stderr, /Use the kit folder for 127\.0\.0\.1:1/)
    assert.equal(existsSync(join(home, 'backups')), false, 'no backup is taken for a refused kit')
  })
})

describe('crew update: the bootstrap and a home behind its kit folder', () => {
  test('a first install makes the kit folder that does not exist yet, and records it in the crew home', () => {
    const target = join(scratch, 'kit-first', 'crew-kit-fixture')
    const home = makeHome('home-first')
    run(['--from', KIT, '--kit', target], { CREW_HOME: home })
    assert.ok(existsSync(join(target, 'update.mjs')), 'the kit folder holds the kit')
    assert.equal(JSON.parse(readFileSync(join(home, 'crew-kit.json'), 'utf8')).kit, target, 'the crew home names its kit folder')
  })

  test('a home whose record is behind a kit folder that another home already updated finishes its own install', () => {
    const target = copyKit('kit-behind')
    const home = makeHome('home-behind')
    // The folder already holds this kit (a copy of it), but this home's record names no file of it.
    writeFileSync(join(home, 'crew-kit.json'), JSON.stringify({ version: '0', kit: target, files: {} }))
    const result = run(['--from', KIT, '--kit', target], { CREW_HOME: home })
    assert.match(result.stdout, /Finishing the install of/, result.stdout + result.stderr)
    assert.ok(JSON.parse(readFileSync(join(home, 'crew-kit.json'), 'utf8')).files['update.mjs'], 'the record now names the kit files')
  })
})

describe('crew update --all', () => {
  test('updates each crew home that was installed from this kit folder, names the others, and reports each exit code', () => {
    const target = copyKit('kit-all')
    const mine = makeHome('home-mine')
    const other = makeHome('home-other')
    const never = makeHome('home-never')
    // The record of a crew home that was installed from this kit folder: its manifest names the folder.
    // A finished install's record: the sha of every kit file, as the update writes it. An empty record would
    // read as a home still behind the folder, and the update would finish its install (init, in this copy, fails).
    const shaOf = name => createHash('sha256').update(readFileSync(join(target, name))).digest('hex')
    const files = Object.fromEntries(readdirSync(target).filter(name => /\.(mjs|md|tmpl|json|sh|txt)$/.test(name) && !/\.test\.mjs$|^(creds|crew|crew\.config|package-lock|crew-kit|kit-instance)\.json$/.test(name)).map(name => [name, shaOf(name)]))
    writeFileSync(join(mine, 'crew-kit.json'), JSON.stringify({ version: '1', kit: target, files }))
    writeFileSync(join(other, 'crew-kit.json'), JSON.stringify({ version: '1', kit: join(scratch, 'elsewhere'), files: {} }))
    const homes = [mine, other, never].join(':')
    const result = run(['--all', '--from', KIT, '--kit', target], { CREW_HOMES: homes, CREW_HOME: mine })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, new RegExp(`${mine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: exit 0`))
    assert.match(result.stdout, new RegExp(`${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: uses the kit in`))
    assert.match(result.stdout, new RegExp(`${never.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: no record of its kit`))
    assert.ok(readdirSync(target).includes('kit-instance.json'))
  })
})
