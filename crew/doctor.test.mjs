// `crew doctor` (crew/doctor.mjs, card mwk8koh1xf1jikjrkff, step 3): for each person with a session, the three paths its session
// needs (its own folder, the crew home, the kit folder) and whether Claude Code trusts each one, plus the exact fix. A fake home and a
// fake config only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { trustReport, formatReport } from './doctor.mjs'

const BASE = '/srv/agents/taskmanager-maintenance'
const KIT = '/srv/agents/taskmanager-maintenance/.local/share/taskmanager-crew'
const WICK = `${BASE}/taskmanager-wick-doc`

/** A fake crew home with sessions for the given keys (key -> folder), and a fake config whose projects come from `projectsOf(home)`. */
function fixture(records, projectsOf) {
  const home = mkdtempSync(join(tmpdir(), 'doctor-home-'))
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ worktreeBase: BASE })}\n`)
  mkdirSync(join(home, 'sessions'), { recursive: true })
  for (const [key, folder] of Object.entries(records)) writeFileSync(join(home, 'sessions', `${key}.json`), `${JSON.stringify({ id: 'abcdef12', folder })}\n`)
  const file = join(mkdtempSync(join(tmpdir(), 'doctor-cfg-')), '.claude.json')
  writeFileSync(file, `${JSON.stringify({ projects: projectsOf(home) })}\n`)
  return { home, file }
}

test('each person with a session has three rows: its folder, the crew home, the kit folder', () => {
  const { home, file } = fixture({ wick: WICK }, () => ({}))
  const rows = trustReport({ home, kit: KIT, file }).rows.filter(r => r.who === 'wick')
  assert.deepEqual(rows.map(r => r.role).sort(), ['crew home', 'kit folder', 'session folder'])
  assert.equal(rows.find(r => r.role === 'session folder').path, WICK)
})

test('a trusted path is marked trusted; an untrusted one is not', () => {
  const { home, file } = fixture({ wick: WICK }, h => ({ [WICK]: { hasTrustDialogAccepted: true }, [h]: { hasTrustDialogAccepted: true } }))
  const rows = trustReport({ home, kit: KIT, file }).rows.filter(r => r.who === 'wick')
  assert.equal(rows.find(r => r.role === 'session folder').trusted, true)
  assert.equal(rows.find(r => r.role === 'crew home').trusted, true)
  assert.equal(rows.find(r => r.role === 'kit folder').trusted, false, 'the kit is not in the config')
})

test('an untrusted path gets the exact fix, which is crew update, and the report names the path', () => {
  const { home, file } = fixture({ wick: WICK }, () => ({}))
  const rep = trustReport({ home, kit: KIT, file })
  assert.ok(rep.fix, 'there is a fix line')
  assert.match(rep.fix, /crew update/)
  const text = formatReport(rep)
  assert.match(text, /not trusted/)
  assert.match(text, /taskmanager-wick-doc/)
})

test('when every path is trusted, the report says all trusted and gives no fix', () => {
  const { home, file } = fixture({ wick: WICK }, h => ({ [WICK]: { hasTrustDialogAccepted: true }, [h]: { hasTrustDialogAccepted: true }, [KIT]: { hasTrustDialogAccepted: true } }))
  const rep = trustReport({ home, kit: KIT, file })
  assert.equal(rep.fix, null)
  assert.match(formatReport(rep), /all trusted/)
})

test('a session whose folder is the crew home (the home is trusted already) is a crew path, not a refused one', () => {
  const { home, file } = fixture({ wren: '' }, h => ({ [h]: { hasTrustDialogAccepted: true }, [KIT]: { hasTrustDialogAccepted: true } }))
  // The record names the home as the session folder: that folder is the crew's own, and it is trusted.
  writeFileSync(join(home, 'sessions', 'wren.json'), `${JSON.stringify({ id: 'abcdef12', folder: home })}\n`)
  const rep = trustReport({ home, kit: KIT, file })
  assert.deepEqual(rep.refused, [], 'the home is not refused')
  assert.equal(rep.rows.find(r => r.who === 'wren' && r.role === 'session folder').trusted, true)
  assert.equal(rep.fix, null)
})

test('a session folder the owner pointed at is listed as refused, with the sentence that says what to do', () => {
  const { home, file } = fixture({ nina: '/home/owner/some-repo' }, () => ({}))
  const rep = trustReport({ home, kit: KIT, file })
  assert.deepEqual(rep.refused, ['/home/owner/some-repo'])
  const text = formatReport(rep)
  assert.match(text, /not a crew folder/)
  assert.match(text, /crew update/)
})
