// `crew people add`: asks the board for the crew's missing people and merges only their new keys into the crew home's
// creds.json (card mw9m0rwynhwj8y2odd). The token comes from TASKMANAGER_MANAGEMENT_TOKEN, never from the command line.
// An entry already in creds.json is never overwritten, and the file is written in one step (a temporary file in the same
// folder, then a rename), mode 0600. No key or password is printed.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TOKEN_ENV = 'TASKMANAGER_MANAGEMENT_TOKEN'
export const REFUSED = 'The board refused this token. crew people add needs a management token for this crew (TASKMANAGER_MANAGEMENT_TOKEN) or the crew owner\'s crews:manage key; a crew member\'s key cannot add people.'

/** The new people in a route answer: those with a password and an API key. Anyone else is left out. */
export function newPeopleOf(answer) {
  const people = answer?.people && typeof answer.people === 'object' ? answer.people : {}
  const out = {}
  for (const [key, person] of Object.entries(people)) {
    if (typeof person?.password === 'string' && typeof person?.apiKey === 'string') {
      out[key] = { email: person.email, password: person.password, apiKey: person.apiKey }
    }
  }
  return out
}

/**
 * Adds the answer's new people to a copy of creds. The old entries stay as they are, including any entry that has the
 * same key. Returns the merged copy and the keys it added, in order.
 */
export function mergeNewPeople(creds, answer) {
  const merged = { ...creds, people: { ...(creds?.people ?? {}) } }
  const added = []
  for (const [key, person] of Object.entries(newPeopleOf(answer))) {
    if (Object.hasOwn(merged.people, key)) continue
    merged.people[key] = person
    added.push(key)
  }
  return { creds: merged, added: added.sort() }
}

/** Writes creds to file as JSON in one step: a temporary file beside it, then a rename. Mode 0600 throughout. */
export function writeCredsAtomic(file, creds) {
  const temp = join(dirname(file), `.${Date.now().toString(36)}-${process.pid}.tmp`)
  try {
    writeFileSync(temp, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
    renameSync(temp, file)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

/** The arguments of `crew people add [--people a,b]`. A token on the command line is refused: it goes in the environment. */
export function parseAddArgs(args) {
  if (args[0] !== 'add') return { error: 'usage: crew people add [--people a,b]' }
  let people = null
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (/^arn_|^mgmt|token/i.test(arg)) return { error: `Give the token in ${TOKEN_ENV}, not on the command line.` }
    if (arg === '--people' || arg.startsWith('--people=')) {
      const value = arg === '--people' ? args[++i] : arg.slice('--people='.length)
      if (!value) return { error: 'crew people add: --people needs a list of keys, such as --people susy,janet.' }
      people = value.split(',').map(key => key.trim()).filter(Boolean)
    } else {
      return { error: `crew people add: unknown argument ${arg.slice(0, 40)}` }
    }
  }
  return { people }
}

/**
 * The command. origin and slug name the crew on the board; home is the crew home (creds.json is in it); token is the
 * management token; fetchImpl and runInit are injected so a test needs no server. Returns the exit code.
 */
export async function addPeople({ origin, slug, home, token, people = null, fetchImpl = fetch, runInit = () => {}, log = () => {} }) {
  if (!token) {
    log(`crew people add: ${TOKEN_ENV} is not set. Put the crew's management token in it (not on the command line).`)
    return 2
  }
  const base = `${origin}/api/crews/${encodeURIComponent(slug)}`
  const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
  const res = await fetchImpl(`${base}/people`, { method: 'POST', headers, body: JSON.stringify(people ? { people } : {}) })
  if (res.status === 401 || res.status === 403) {
    log(REFUSED)
    return 3
  }
  if (!res.ok) {
    log(`crew people add: the board answered ${res.status}; nothing was changed here.`)
    return 1
  }
  const answer = await res.json()
  const credsFile = join(home, 'creds.json')
  const creds = existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, 'utf8')) : {}
  const { creds: merged, added } = mergeNewPeople(creds, answer)
  if (added.length === 0) {
    log('crew people add: nothing to add; every person of the kit already has a key.')
    await printCast(fetchImpl, base, headers, log)
    return 0
  }
  try {
    writeCredsAtomic(credsFile, merged)
  } catch {
    // The keys were made on the board and the route only makes missing people, so these cannot be fetched again.
    log(`crew people add: the keys of ${added.join(', ')} were made on the board but could not be written to creds.json, and they are lost. crew people add cannot get them again. Boss decides a recovery path.`)
    return 4
  }
  log(`crew people add: added ${added.join(', ')}.`)
  await printCast(fetchImpl, base, headers, log)
  runInit()
  log(`tell Pia: new people ${added.join(', ')}`)
  return 0
}

async function printCast(fetchImpl, base, headers, log) {
  const res = await fetchImpl(base, { headers: { authorization: headers.authorization } })
  if (!res.ok) return
  const body = await res.json()
  for (const person of body.cast ?? []) log(`  ${person.key}: ${person.present ? 'present' : 'missing'}`)
}

// The command line: crew people add [--people a,b], run through crew.mjs with the crew's own config.
async function main(args) {
  const parsed = parseAddArgs(args)
  if (parsed.error) {
    console.error(parsed.error)
    return 64
  }
  const { config, here } = await import('./config.mjs')
  const origin = new URL(config.board.url).origin
  const slug = config.crew?.slug
  if (!slug) {
    console.error('crew people add: crew.json has no crew slug (crew.slug).')
    return 64
  }
  const kitDir = dirname(fileURLToPath(import.meta.url))
  return addPeople({
    origin,
    slug,
    home: here.replace(/\/$/, ''),
    token: process.env[TOKEN_ENV],
    people: parsed.people,
    log: line => console.log(line),
    runInit: () => spawnSync(process.execPath, [join(kitDir, 'init.mjs')], { stdio: 'inherit', env: process.env })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  }, (error) => {
    console.error(`crew people add: ${error.message}`)
    process.exitCode = 1
  })
}
