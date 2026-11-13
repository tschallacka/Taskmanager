// Fixtures the crew kit tests share (update.test.mjs and kit.test.mjs): a copy of the kit's shipped files, and a crew.json.
// Not a test file itself: the runner picks up *.test.mjs only.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The names a kit folder ships, from its kit-files.txt (comments and blank lines skipped). */
export function kitListed(from) {
  return readFileSync(join(from, 'kit-files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}

/** Copies the kit's shipped files into dest, the way a crew installs them. kit-files.txt comes along. */
export function copyKitFiles(dest, from) {
  mkdirSync(dest, { recursive: true })
  for (const name of [...kitListed(from), 'kit-files.txt']) copyFileSync(join(from, name), join(dest, name))
  return dest
}

/** Writes a crew.json for a board at url. Each test passes only what it checks; the rest is a plain test crew. */
export function writeCrewJson(home, { slug = 'test', url = 'http://127.0.0.1:9', team = 'Test Crew', product = { name: 'Test', repo: '' } } = {}) {
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ team, product, board: { url }, crew: { slug } }))
  return home
}
