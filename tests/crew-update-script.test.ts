// The one-line crew update served at /crew/update.sh: the origin is written in one place, and a value that is
// not a plain http(s) origin is refused. Run:
//   node --import tsx --test tests/crew-update-script.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewUpdateScript, crewUpdateOrigin } from '../server/utils/crewUpdateScript'

test('the script names the instance it updates from, and runs the fresh kit', () => {
  const script = crewUpdateScript('https://taskmanager.example.test')
  assert.match(script, /^#!\/bin\/sh/)
  assert.match(script, /ORIGIN='https:\/\/taskmanager\.example\.test'/)
  assert.match(script, /curl -fsSL -D "\$TMP\/headers" -o "\$TMP\/kit\.tar\.gz" "\$ORIGIN\/crew\/kit\.tar\.gz"/)
  assert.match(script, /tar -xzf "\$TMP\/kit\.tar\.gz" -C "\$TMP\/kit"/)
  assert.match(script, /node "\$TMP\/kit\/update\.mjs" --from "\$TMP\/kit" --kit "\$KIT"/)

  assert.match(script, /"\$HOME\/crew-kit-\$HOST"/, 'the default kit folder is per instance')
})

test('an origin that is not a plain http(s) URL is refused', () => {
  assert.throws(() => crewUpdateOrigin('https://x.example\';rm -rf ~;\''), /not a plain origin/)
  assert.throws(() => crewUpdateOrigin('ftp://x.example'), /not a plain origin/)
  assert.equal(crewUpdateOrigin('http://localhost:3104'), 'http://localhost:3104')
})
