// `crew update` leaves Pia's session CLAUDE.md alone: an owner's edited copy is kept byte for byte, as init keeps it.
// update.mjs is not changed; this test proves it. Temp folders only, no network. Run: node --test crew/pia-claude-update.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { copyKitFiles, writeCrewJson } from './test-fixtures.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const UPDATE = join(KIT, 'update.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'crew-pia-update-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

test('crew update keeps an edited pia-session/CLAUDE.md byte for byte', () => {
  const home = writeCrewJson(join(scratch, 'home'), { slug: 'home', url: 'http://127.0.0.1:1', team: 'Team', product: { name: 'Product', repo: '' } })
  const target = copyKitFiles(join(scratch, 'kit'), KIT)
  const claude = join(home, 'pia-session', 'CLAUDE.md')
  mkdirSync(join(home, 'pia-session'), { recursive: true })
  // Owner's own bytes, with a non-UTF-8 byte and no trailing newline, so any rewrite would show.
  const edited = Buffer.from('# owner note\n\nBelow the marker, the owner writes.\n\xff\x00 kept')
  writeFileSync(claude, edited)
  const result = spawnSync(process.execPath, [UPDATE, '--from', KIT, '--kit', target], {
    encoding: 'utf8',
    env: { ...process.env, CREW_HOME: home, CLAUDE_CONFIG_DIR: join(scratch, 'claude'), XDG_CONFIG_HOME: join(scratch, 'xdg') }
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(readFileSync(claude), edited, 'the edited copy is unchanged')
})
