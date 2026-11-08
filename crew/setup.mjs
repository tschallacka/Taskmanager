#!/usr/bin/env node
// Makes a crew by hand: a thin client of POST /api/crews on the Taskmanager instance. The
// instance admin's crews:manage key comes from the environment, never from a file here:
//
//   CREW_ADMIN_KEY=<key> node setup.mjs             # first time: writes creds.json (mode 600)
//   CREW_ADMIN_KEY=<key> node setup.mjs --rotate    # the crew exists but creds.json is lost
//
// It reads crew.json in CREW_HOME for the product name and board URL. The keys come from POST /api/crews/:slug/keys
// (JSON, for creds.json); the create answer has none. Nothing secret is printed.
import { writeFileSync, chmodSync } from 'node:fs'
import { config, here } from './config.mjs'

const key = process.env.CREW_ADMIN_KEY
if (!key) {
  console.error('Set CREW_ADMIN_KEY to a crews:manage key of the instance admin (shown once in the Crews settings).')
  process.exit(78)
}
const rotate = process.argv.includes('--rotate')
const slug = config.crew?.slug || process.env.CREW_SLUG
if (!slug) {
  console.error('Set "crew": { "slug": "..." } in crew.json (or CREW_SLUG): lowercase letters, digits and dashes.')
  process.exit(78)
}

const base = config.board.url
const res = await fetch(`${base}/api/crews`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
  body: JSON.stringify({ slug, name: config.team, product: config.product, rotate })
})
const body = await res.json().catch(() => ({}))

if (res.status === 409) {
  console.error(`The crew "${slug}" already exists. Run with --rotate to get new keys (the old ones stop working).`)
  process.exit(1)
}
if (!res.ok) {
  console.error(`The crew API answered ${res.status}: ${body.message ?? 'no detail'}`)
  process.exit(1)
}

// The create answers without secrets. The keys come from the keys route, as JSON, straight into creds.json (mode 600):
// the body is never printed.
const keysRes = await fetch(`${base}/api/crews/${slug}/keys?format=json`, {
  method: 'POST',
  headers: { authorization: `Bearer ${key}` }
})
const keys = await keysRes.json().catch(() => ({}))
if (!keysRes.ok) {
  console.error(`The keys route answered ${keysRes.status}: ${keys.message ?? 'no detail'}`)
  process.exit(1)
}

const file = `${here}creds.json`
writeFileSync(file, JSON.stringify({ ...keys, base: keys.base ?? base }, null, 2))
chmodSync(file, 0o600)
console.log(`Crew "${slug}" ${res.status === 201 ? 'created' : 'rotated'}. Board: ${body.crew?.boardUrl ?? '(see the Crews page)'}`)
console.log(`Credentials written to ${file}. Next: node init.mjs, then read README.md.`)
