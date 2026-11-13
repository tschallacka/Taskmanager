// The one-line crew update served at /crew/update.sh: the origin is written in one place, and a value that is
// not a plain http(s) origin is refused. Run:
//   node --import tsx --test tests/crew-update-script.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewUpdateScript } from '../server/utils/crewUpdateScript'
import { crewUpdateOrigin } from '../shared/utils/crewUpdate'

test('the script names the instance it updates from, and runs the fresh kit', () => {
  const script = crewUpdateScript('https://taskmanager.example.test')
  assert.match(script, /^#!\/bin\/sh/)
  assert.match(script, /ORIGIN='https:\/\/taskmanager\.example\.test'/)
  assert.match(script, /curl -fsSL -D "\$TMP\/headers" -o "\$TMP\/kit\.tar\.gz" "\$ORIGIN\/crew\/kit\.tar\.gz"/)
  assert.match(script, /tar -xzf "\$TMP\/kit\.tar\.gz" -C "\$TMP\/kit"/)
  assert.match(script, /node "\$TMP\/kit\/update\.mjs" --from "\$TMP\/kit" --kit "\$KIT"/)

  assert.match(script, /"\$HOME\/crew-kit-\$HOST"/, 'the default kit folder is per instance')
})

test('an IPv6 origin is a plain origin too: the script is served, with the bracketed host and the one usage line', () => {
  const script = crewUpdateScript('http://[::1]:3000')
  assert.match(script, /ORIGIN='http:\/\/\[::1\]:3000'/)
  assert.match(script, /^# Usage: curl -fsSL http:\/\/\[::1\]:3000\/crew\/update\.sh \| sh -s -- <crew home>$/m)
  assert.equal(crewUpdateOrigin('https://[2001:db8::1]'), 'https://[2001:db8::1]')
})

test('the usage line is written from one string: the comment and the usage error name the same command', () => {
  const script = crewUpdateScript('https://taskmanager.example.test')
  const usage = 'curl -fsSL https://taskmanager.example.test/crew/update.sh | sh -s -- <crew home>'
  assert.equal(script.split(usage).length - 1, 2, 'the comment and the usage error both name it')
})

test('an origin that is not a plain http(s) URL is refused', () => {
  assert.throws(() => crewUpdateOrigin('https://x.example\';rm -rf ~;\''), /not a plain origin/)
  assert.throws(() => crewUpdateOrigin('ftp://x.example'), /not a plain origin/)
  assert.equal(crewUpdateOrigin('http://localhost:3104'), 'http://localhost:3104')
})
