// Shared loader for the crew's settings. Every script imports this instead of knowing
// about a project, a machine or a chat channel.
//
// Everything the kit writes (creds.json, crew.json, profiles, logs, the rendered documents)
// lives in CREW_HOME, so the kit folder itself can be replaced on update. CREW_HOME defaults
// to the kit folder. crew.json (written by `crew setup`, or by hand) holds the product,
// URLs, people and chat settings; creds.json holds the accounts and keys the board made.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { crewHome, kitDir } from './home.mjs'
import { migrateCrewHome, renameKeys } from './keys.mjs'

export { kitDir }
const home = crewHome()
export const here = `${home}/`

// crew.json is the one file a provisioned crew needs. crew.config.json is read too, so an
// older hand-made setup keeps working.
const configFile = [`${here}crew.json`, `${here}crew.config.json`].find(file => existsSync(file))
if (!configFile) {
  // Both forms of the path: a CREW_HOME that resolves somewhere unexpected is the usual cause.
  console.error(process.env.CREW_HOME
    ? `No crew.json in ${here}\nCREW_HOME is "${process.env.CREW_HOME}", which resolves to ${home}. Set CREW_HOME to the full path of the folder that holds crew.json.`
    : `No crew.json in ${here}\nCREW_HOME is not set, so the kit looked in its own folder. Set CREW_HOME to the full path of the folder that holds crew.json (the crew is made on the Crews page, or with POST /api/crews: see README.md).`)
  process.exit(78)
}

// A crew home made before the person keys were renamed (w1..w4, pietje) is moved to the new ones here.
migrateCrewHome(home)
const raw = JSON.parse(readFileSync(configFile, 'utf8'))
raw.people = renameKeys(raw.people)
raw.nicks = renameKeys(raw.nicks)

// Defaults for everything optional, so a short config works.
export const config = {
  team: raw.team ?? 'Crew',
  product: { name: 'My Product', repo: '', appUrl: raw.board?.url ?? 'http://localhost:3000', ...raw.product },
  board: {
    url: 'http://localhost:3000',
    name: `${raw.product?.name ?? 'My Product'} Development Center`,
    ...raw.board
  },
  customer: { name: 'The Customer', personName: 'Casey Customer', nick: 'customer', ...raw.customer },
  people: {
    boss: 'Boss', pm: 'Pia Planner', wren: 'Wren Worker', wick: 'Wick Worker', wynn: 'Wynn Worker', wade: 'Wade Worker',
    usher: 'Usher Xander', nitpicker: 'Nina Nitpick', contact: 'Casey Contact', watcher: 'Log Watcher',
    ...raw.people
  },
  nicks: { pm: 'pia', wren: 'wren', wick: 'wick', wynn: 'wynn', wade: 'wade', usher: 'usher', nitpicker: 'nitpicker', ...raw.nicks },
  // The chat line is optional and off by default: with no client, meetings and steering go
  // through the board (board messages, `list_messages`).
  chat: { client: '', channel: '#crew', workChannel: '#crewwork', ...raw.chat },
  // Browser for the screenshots: this path, else CHROMIUM, else Playwright's own.
  chromium: raw.chromium ?? '',
  fontDir: raw.fontDir ?? '',
  // Where Claude Code keeps the transcripts of this session's subagents (for watchlogs.mjs).
  subagentsDir: raw.subagentsDir ?? '',
  // The slug the crew API files this crew under (setup.mjs reads it).
  crew: raw.crew ?? {},
  devLog: raw.devLog ?? `${here}dev.log`
}

// The columns every board needs, in this order. The crew API creates them.
export const COLUMNS = ['Backlog', 'To do', 'In progress', 'Verify PM', 'Verify UX', 'Verify CQ', 'Verify QA', 'Verify', 'Ready for live', 'Done', 'Blocked', 'Bugs']

/**
 * The forks of this crew: one file each in CREW_HOME/forks, as the board's "Fork the crew for this board"
 * hands them over. A file that does not read as a fork (not JSON, no members with an agent type and a key)
 * is left out, so one broken file never stops the rest.
 */
export function loadForks() {
  const dir = `${here}forks`
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().flatMap((file) => {
    try {
      const data = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
      const usable = Array.isArray(data.members) && data.members.length && data.members.every(m => m?.agentType && m.apiKey && m.email)
      return usable ? [{ file, data }] : []
    } catch { return [] }
  })
}

export function loadCreds() {
  const file = `${here}creds.json`
  if (!existsSync(file)) {
    console.error(`No creds.json in ${here}: the crew has not been provisioned here (see README.md).`)
    process.exit(78)
  }
  const creds = JSON.parse(readFileSync(file, 'utf8'))
  // A fork signs in as its agent type (`internal-tools-wren`), so `crew internal-tools-wren mcp ...` works like any member.
  creds.people ??= {}
  for (const { data } of loadForks()) {
    for (const person of data.members) {
      if (!creds.people[person.agentType]) creds.people[person.agentType] = { name: person.name, email: person.email, password: person.password, apiKey: person.apiKey, fork: data.board?.name ?? true }
    }
  }
  return creds
}

const slugify = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// The members Boss launches as agents, the optional log watcher included.
export const CAST = ['pm', 'wren', 'wick', 'wynn', 'wade', 'usher', 'nitpicker', 'watcher']

/**
 * Each member's Claude Code agent type, such as acme-pia-planner: the crew slug first, so two crews
 * on one machine never share one. init.mjs writes the definitions; PROMPTS.md names them.
 */
export const agentNames = Object.fromEntries(CAST.map(key => [key, `${slugify(config.crew.slug || config.team)}-${slugify(config.people[key])}`]))

// A path as one shell word, quoted only when it has to be.
const shellWord = text => (/^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`)

/**
 * Flat view of the config for templates: {{product.name}}, {{chat.channel}}, {{crew_dir}} ...
 * {{node_kit}} starts a kit command with this crew's CREW_HOME, so it works from any session:
 * `{{node_kit}}/crew.mjs wren tools` renders as `CREW_HOME=<crew home> node <kit folder>/crew.mjs wren tools`,
 * with both paths written out in full.
 */
export function templateValues() {
  const out = {
    crew_dir: home,
    kit_dir: kitDir,
    node_kit: `CREW_HOME=${shellWord(home)} node ${shellWord(kitDir)}`,
    today: new Date().toISOString().slice(0, 10)
  }
  const walk = (prefix, value) => {
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}.${k}` : k, v)
    else out[prefix] = String(value ?? '')
  }
  walk('', { ...config, agents: agentNames })
  return out
}
