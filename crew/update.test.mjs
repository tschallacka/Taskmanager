// Tests for `crew update`: the instance record of a kit folder, the refusal for a kit of another instance, the link of a
// crew home to its kit folder, and `crew update --all`. Temp folders only, no network: every run passes --from a copy of
// this kit. Run from the repo root: node --test crew/update.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { copyKitFiles, kitListed, writeCrewJson } from './test-fixtures.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const UPDATE = join(KIT, 'update.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'crew-update-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// A crew home with a crew.json for a board on 127.0.0.1 port 1 (never answers: these tests never fetch).
function makeHome(name, boardUrl = 'http://127.0.0.1:1') {
  return writeCrewJson(join(scratch, name), { slug: name, url: boardUrl, team: 'Team', product: { name: 'Product', repo: '' } })
}

// A copy of this kit's shipped files, so an update can run against a folder that is not the repo's.
function copyKit(name) {
  return copyKitFiles(join(scratch, name), KIT)
}

// The sha of every file the kit folder ships, kit-files.txt included, as an install records it.
function shaRecord(dir) {
  const sha = name => createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
  return Object.fromEntries([...kitListed(dir), 'kit-files.txt'].map(name => [name, sha(name)]))
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [UPDATE, ...args], {
    encoding: 'utf8',
    // The agent definitions and skills init writes go to the scratch folder, never to the real ~/.claude.
    env: { ...process.env, CLAUDE_CONFIG_DIR: join(scratch, 'claude'), XDG_CONFIG_HOME: join(scratch, 'xdg'), ...env }
  })
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

  test('the kit\'s own instance record is never a kit file: it is not in the install record', () => {
    // A kit folder listed without its kit-files.txt: the names come from the folder itself, the way a kit served
    // without the list is read. The record of the instance sits in that folder and must not count as a kit file.
    const from = copyKitFiles(join(scratch, 'from-instance'), KIT)
    rmSync(join(from, 'kit-files.txt'))
    writeFileSync(join(from, 'kit-instance.json'), JSON.stringify({ host: '127.0.0.1:1', version: '0' }))
    const target = copyKit('kit-instance-target')
    const home = makeHome('home-instance')
    const result = run(['--from', from, '--kit', target], { CREW_HOME: home })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const manifest = JSON.parse(readFileSync(join(home, 'crew-kit.json'), 'utf8'))
    assert.equal(manifest.files['kit-instance.json'], undefined, 'kit-instance.json is not one of the kit files')
    assert.ok(manifest.files['update.mjs'], 'the kit files are still recorded')
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

  test('a crew home with no record of its kit is linked to the kit folder when that folder already holds the kit', () => {
    // A crew installed before the kit record existed: crew.json and its owner files, no crew-kit.json at all.
    const target = copyKit('kit-link')
    const home = makeHome('home-link')
    const result = run(['--from', KIT, '--kit', target], { CREW_HOME: home })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /is up to date/)
    const manifest = JSON.parse(readFileSync(join(home, 'crew-kit.json'), 'utf8'))
    assert.equal(manifest.kit, target, 'the home now names its kit folder')
    assert.equal(manifest.files['update.mjs'], shaRecord(target)['update.mjs'], 'the record holds the files the folder holds')
  })
})

describe('crew update --all', () => {
  test('updates every crew home of this kit folder, including one installed before the kit record, and names the others', () => {
    const target = copyKit('kit-all')
    const mine = makeHome('home-mine')
    const other = makeHome('home-other')
    const legacy = makeHome('home-legacy')
    const bare = join(scratch, 'home-bare')
    mkdirSync(bare)
    writeFileSync(join(mine, 'crew-kit.json'), JSON.stringify({ version: '1', kit: target, files: shaRecord(target) }))
    writeFileSync(join(other, 'crew-kit.json'), JSON.stringify({ version: '1', kit: join(scratch, 'elsewhere'), files: {} }))
    const homes = [mine, other, legacy, bare].join(':')
    const result = run(['--all', '--from', KIT, '--kit', target], { CREW_HOMES: homes, CREW_HOME: mine })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, new RegExp(`${escape(mine)}: exit 0`))
    assert.match(result.stdout, new RegExp(`${escape(legacy)}: exit 0`), 'a home installed before the record is updated too')
    assert.match(result.stdout, new RegExp(`${escape(other)}: uses the kit in`))
    assert.match(result.stdout, new RegExp(`${escape(bare)}: not a crew home`))
    assert.doesNotMatch(result.stdout, /never updated/)
    assert.equal(JSON.parse(readFileSync(join(legacy, 'crew-kit.json'), 'utf8')).kit, target, 'the legacy home is now linked')
    assert.ok(readdirSync(target).includes('kit-instance.json'))
  })
})
