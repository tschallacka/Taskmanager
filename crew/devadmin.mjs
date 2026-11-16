// crew devadmin show <key>            list the instance admins of your own dev database
// crew devadmin make-admin <key> <email>   make that account an instance admin
//
// Works only on arnotes_dev_<key> on localhost, for a key of the crew. It refuses the live and
// the test databases, any other host, and any key it does not know. It prints accounts and
// their admin flag, never a password or a secret. The SQL touches one column of the "user"
// table (is_instance_admin) and nothing else.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CAST } from './cast.mjs'

// The keys that may have a dev database of their own (arnotes_dev_<key>): every member of CAST except the ones who
// never run a dev copy or a test database. A new member of CAST gets devadmin access unless it is listed here.
const NO_DEV_DATABASE = ['susy', 'janet', 'tess', 'rita', 'watcher', 'wes', 'wilma', 'walt']
export const CREW_KEYS = CAST.filter(key => !NO_DEV_DATABASE.includes(key))
const PORT = 55433

// The database for one key, from the key alone: arnotes_dev_<key> on localhost.
export function devDatabaseUrl(key, user = 'arnotes', port = PORT) {
  if (!CREW_KEYS.includes(key)) throw new Error(`unknown key "${key}": use one of the crew keys`)
  return `postgresql://${user}@localhost:${port}/arnotes_dev_${key}`
}

// Refuse any target that is not the key's own dev database on localhost.
export function checkTarget(url, key) {
  if (!CREW_KEYS.includes(key)) return `refused: unknown key "${key}"`
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'refused: the database URL does not parse'
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') return 'refused: not a postgres URL'
  if (parsed.hostname !== 'localhost') return `refused: host "${parsed.hostname}" is not localhost`
  const db = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (db === 'arnotes') return 'refused: the live dev database arnotes is Boss only'
  if (db.startsWith('arnotes_test')) return 'refused: test databases are not for this command'
  if (db !== `arnotes_dev_${key}`) return `refused: database "${db}" is not arnotes_dev_${key}`
  return null
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

// The SQL for one action. Email is checked against a strict pattern before it goes in.
export function sqlFor(action, email) {
  if (action === 'show') {
    return 'SELECT email FROM "user" WHERE is_instance_admin ORDER BY email;'
  }
  if (action === 'make-admin') {
    if (!EMAIL.test(email || '')) throw new Error('refused: the email is not a plain address')
    return `UPDATE "user" SET is_instance_admin = true WHERE email = '${email}' RETURNING email;`
  }
  throw new Error(`unknown action "${action}"`)
}

function main(argv) {
  const [action, key, email] = argv
  if (!['show', 'make-admin'].includes(action) || !key) {
    console.error('usage: crew devadmin show <key> | crew devadmin make-admin <key> <email>')
    return 2
  }
  const url = devDatabaseUrl(key, process.env.DEV_DB_USER || 'arnotes', Number(process.env.DEV_DB_PORT || PORT))
  const refused = checkTarget(url, key)
  if (refused) {
    console.error(refused)
    return 3
  }
  let sql
  try {
    sql = sqlFor(action, email)
  } catch (e) {
    console.error(e.message)
    return 2
  }
  const r = spawnSync('psql', [url, '-X', '-A', '-t', '-c', sql], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error('psql failed (the dev database may not be up)')
    return r.status || 1
  }
  const lines = r.stdout.split('\n').map(s => s.trim()).filter(Boolean)
  console.log(action === 'show' ? `instance admins on arnotes_dev_${key}:` : `admin set on arnotes_dev_${key}:`)
  for (const l of lines) console.log(`  ${l}`)
  if (action === 'make-admin' && lines.length === 0) console.log('  no account with that email')
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
