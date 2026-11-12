#!/usr/bin/env node
// `crew setup`: makes one new crew for one board, in one go. A thin client of the crew API with the
// management token of the board, which the owner copies from "Add a crew to this board":
//
//   TASKMANAGER_MANAGEMENT_TOKEN=<token> node setup.mjs --origin <url> --board <board id> --repo <path>
//       [--name <crew name>] [--slug <slug>]
//
// The token comes from TASKMANAGER_MANAGEMENT_TOKEN, or from stdin when that is unset. It is never read from argv.
// What it does, in order:
//   1. POST /api/crews with "projectId": the board. The crew is always new: a taken slug stops the command (409),
//      it never rotates an existing crew.
//   2. The crew home is ~/crew-<slug> (mode 700), unless CREW_HOME is set. A home that already holds creds.json stops the
//      command before step 1, with nothing changed.
//   3. The keys are fetched once, as JSON, straight into creds.json (mode 600). Nothing secret is printed.
//   4. crew.json is written from the create answer: the team, the slug, the product, the repository and the
//      crew's work board, which is the shadow board of the crew (by id and url). The real board is kept as context.
//   5. init.mjs runs in the crew home, so the agent types exist.
// It ends with three lines: the crew home, the work board's url, and what to do next.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const kitDir = dirname(fileURLToPath(import.meta.url))

function usage(message) {
  console.error(message)
  console.error('usage: crew setup --origin <url> --board <board id> --repo <path> [--name <crew name>] [--slug <slug>]')
  console.error('the management token goes in TASKMANAGER_MANAGEMENT_TOKEN (or stdin), never on the command line')
  process.exit(2)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (!flag.startsWith('--')) usage(`unexpected argument "${flag}"`)
    const name = flag.slice(2)
    if (!['origin', 'board', 'repo', 'name', 'slug'].includes(name)) usage(`unknown flag ${flag}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) usage(`${flag} needs a value`)
    out[name] = value
    i += 1
  }
  return out
}

async function readToken() {
  const fromEnv = process.env.TASKMANAGER_MANAGEMENT_TOKEN?.trim()
  if (fromEnv) return fromEnv
  if (process.stdin.isTTY) return ''
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text.trim()
}

// The slug is the crew's name in the API: lowercase letters, digits and hyphens, 2 to 63 characters.
function slugFor(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)
}

const args = parseArgs(process.argv.slice(2))
if (!args.origin) usage('--origin is required')
if (!args.board) usage('--board is required')
if (!args.repo) usage('--repo is required')
const origin = args.origin.replace(/\/+$/, '')
const token = await readToken()
if (!token) usage('no management token: set TASKMANAGER_MANAGEMENT_TOKEN, or pipe the token on stdin')

const api = `${origin}/api`
const auth = { authorization: `Bearer ${token}` }

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? auth : { ...auth, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const answer = await res.json().catch(() => ({}))
  return { res, answer }
}

// Stop with the sentence the server gave: the token rules and the crew permission are the server's to word.
function stop(res, answer) {
  const message = answer.message ?? answer.statusMessage ?? 'no detail'
  if (res.status === 401) console.error(`Stopped: the token was refused (${answer.code ?? 'unauthorized'}). ${message}`)
  else if (res.status === 403) console.error(`Stopped: ${message}`)
  else console.error(`Stopped: the crew API answered ${res.status}: ${message}`)
  process.exit(1)
}

// The board's name and the people's team come from the targets: a token reaches only its own board.
const targets = await call('GET', `${api}/crews/targets`)
if (!targets.res.ok) stop(targets.res, targets.answer)
const userboard = (targets.answer.teams ?? []).flatMap(team => team.userboards ?? [])
  .find(entry => entry.board_id === args.board)
if (!userboard) {
  console.error(`Stopped: board ${args.board} is not one this token can make a crew for.`)
  process.exit(1)
}
const boardName = userboard.board_name ?? args.board
const slug = args.slug ?? slugFor(boardName)
if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(slug)) usage(`the slug "${slug}" is not 2 to 63 characters of a to z, 0 to 9 and hyphens`)
const name = args.name ?? `${boardName} crew`
// The crew home: CREW_HOME when set, else ~/crew-<slug>. Decided before any call, so a home that already holds keys stops
// the command with nothing changed.
const home = process.env.CREW_HOME || join(homedir(), `crew-${slug}`)
if (existsSync(join(home, 'creds.json'))) {
  console.error(`Stopped: the crew home ${home} already holds creds.json. Nothing was changed. Point CREW_HOME at a new folder, or move that one away first.`)
  process.exit(1)
}

const created = await call('POST', `${api}/crews`, {
  slug,
  name,
  product: { name: boardName },
  projectId: args.board
})
if (created.res.status === 409) {
  console.error(`Stopped: the slug "${slug}" is taken. Run again with --slug <another slug>. Nothing was rotated.`)
  process.exit(1)
}
if (!created.res.ok) stop(created.res, created.answer)
const answer = created.answer

// The keys: one call, as JSON, into creds.json. The answer of the create holds none.
mkdirSync(home, { recursive: true, mode: 0o700 })
chmodSync(home, 0o700)
const keysUrl = new URL(answer.keys_url ?? `/api/crews/${slug}/keys`, origin).href
const keysRes = await fetch(`${keysUrl}${keysUrl.includes('?') ? '&' : '?'}format=json`, { method: 'POST', headers: auth })
const keys = await keysRes.json().catch(() => ({}))
if (!keysRes.ok) stop(keysRes, keys)
const creds = join(home, 'creds.json')
writeFileSync(creds, JSON.stringify({ ...keys, base: keys.base ?? origin }, null, 2), { mode: 0o600 })
chmodSync(creds, 0o600)

// crew.json: the work board is the shadow board, named by its id. The real board is context only.
const shadow = answer.shadow_board ?? {}
const real = answer.real_board ?? {}
if (!shadow.url || !shadow.board_id) {
  console.error('Stopped: the create answer has no shadow board. The crew is made; ask the owner to check the Crews page.')
  process.exit(1)
}
const crewJson = {
  team: typeof answer.team === 'string' ? answer.team : (answer.team?.name ?? name),
  crew: { slug, name },
  product: { name: boardName, repo: args.repo },
  board: { url: shadow.url, id: shadow.board_id, name: shadow.board_name ?? `${boardName} crew board` },
  realBoard: { url: real.url ?? '', id: real.board_id ?? args.board, name: real.board_name ?? boardName, readOnly: true }
}
writeFileSync(join(home, 'crew.json'), `${JSON.stringify(crewJson, null, 2)}\n`, { mode: 0o600 })
chmodSync(join(home, 'crew.json'), 0o600)

// The agent types: init.mjs in the crew home. Its failures are printed by init itself.
const init = spawnSync(process.execPath, [join(kitDir, 'init.mjs')], {
  cwd: kitDir,
  env: { ...process.env, CREW_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe']
})
const initOutput = `${init.stdout ?? ''}${init.stderr ?? ''}`
const initOk = init.status === 0

console.log(`Crew "${slug}" made for "${boardName}". Crew home: ${home}`)
console.log(`Work board: ${shadow.url}`)
console.log(initOk
  ? 'Next: start your Boss session and give it the Boss prompt from PROMPTS.md in the crew home.'
  : `init did not finish (exit ${init.status}). Run CREW_HOME=${home} node ${join(kitDir, 'init.mjs')} and read what it prints.`)
if (!initOk && existsSync(join(home, 'crew.json'))) console.error(initOutput.trim().split('\n').slice(-5).join('\n'))
