#!/usr/bin/env node
// `crew down` (card mwdes2ndd0l74yu9nr, step 1: Pia and the dev services). It takes the parts of crew.json "up" down in
// reverse order. A part with a person is asked first, by mail, with a request id and the wrap-up text; it is stopped only
// when that person's own "crew down ok" mail comes back with the same id. crew down writes no such mail itself. A part
// that is not confirmed by the timeout is left running and reported, unless --force stops it anyway. A part with no person
// (the dev services) has no mail, and is stopped by its own stop command. Pia relays the request to the workers (condition 3).
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchMail, sendMail } from './mail-client.mjs'

export const DEFAULT_TIMEOUT_MS = 5 * 60_000

export function shell(command, env) {
  const run = spawnSync('sh', ['-c', command], { encoding: 'utf8', env, timeout: 300000 })
  return { ok: run.status === 0, status: run.status, stderr: (run.stderr || run.stdout || '').trim().split('\n').pop() || '' }
}

export function newRequestId() {
  return randomBytes(6).toString('hex')
}

/** The wrap-up text sent with the request (condition 1): what the person does before it stops. */
export function wrapUpText(person, requestId) {
  return `crew down request ${requestId} for ${person}: finish or park your current step, post what is open on your card, read your mail, then reply with the line "crew down ok: ${person}; stopped; <N> unread kept; request ${requestId}; at <time>". Your session is stopped after that reply.`
}

/**
 * Takes the parts down, in reverse order. `ask(person, requestId, text)` mails a person; `waitFor(person, requestId, ms)`
 * resolves true when that person's down ok with the same request id has come back before the timeout. `runner` runs a
 * command (injected in tests). Returns one line per part and whether every part is down.
 */
export function downParts(parts, {
  ask = () => {},
  waitFor = async () => false,
  runner = shell,
  env = process.env,
  force = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  newId = newRequestId
} = {}) {
  return (async () => {
    const lines = []
    let allDown = true
    for (const part of [...parts].reverse()) {
      const name = part.name || '(unnamed)'
      if (!part.person) {
        const stopped = part.stop ? runner(part.stop, env) : { ok: true }
        if (stopped.ok) lines.push(`${name}: stopped`)
        else {
          allDown = false
          lines.push(`${name}: failed to stop: ${stopped.stderr || `exit ${stopped.status}`}`)
        }
        continue
      }
      const requestId = newId()
      await ask(part.person, requestId, wrapUpText(part.person, requestId))
      const confirmed = await waitFor(part.person, requestId, timeoutMs)
      if (!confirmed && !force) {
        allDown = false
        lines.push(`${name}: not confirmed by ${part.person} within the timeout; left running (use --force to stop it anyway)`)
        continue
      }
      const stopped = part.stop ? runner(part.stop, env) : { ok: true }
      if (stopped.ok) lines.push(`${name}: ${confirmed ? 'stopped' : 'stopped (forced, not confirmed)'}`)
      else {
        allDown = false
        lines.push(`${name}: failed to stop: ${stopped.stderr || `exit ${stopped.status}`}`)
      }
    }
    return { lines, ok: allDown }
  })()
}

function readJsonOr(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

/** The reply line a person sends back (wrapUpText asks for it): "crew down ok: <person>; ...; request <id>; ...". */
export function isDownOk(text, person, requestId) {
  const body = String(text ?? '')
  return body.includes(`crew down ok: ${person};`) && body.includes(`request ${requestId};`)
}

/**
 * Mails the request to one person through the app's mail route, from Pia's key. A send the app does not take yet goes to
 * the outbox and is flushed later. A failure is reported on stderr and never thrown: the wait then times out and the part
 * is left running (or stopped with --force), so one bad mail never stops the rest of the parts.
 */
export async function askPerson({ base, slug, key, person, text, mailboxDir, makeId, fetch: fetchImpl = fetch }) {
  try {
    await sendMail({ fetch: fetchImpl, base, slug, key, to: person, text, mailboxDir, makeId })
    return true
  } catch (error) {
    console.error(`crew down: could not mail ${person}: ${error.message}`)
    return false
  }
}

/**
 * Waits for the person's own "crew down ok" with the same request id, reading Pia's inbox (fetchMail reads and does not
 * ack, so no other mail is consumed). Polls every `interval` ms until `timeoutMs`. Resolves true at the first match.
 */
export async function waitForConfirmation({
  base, slug, key, person, requestId, timeoutMs = DEFAULT_TIMEOUT_MS, interval = 5000,
  fetch: fetchImpl = fetch, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const deadline = now() + timeoutMs
  for (;;) {
    try {
      const mails = await fetchMail({ fetch: fetchImpl, base, slug, key, to: 'pia' })
      if (mails.some(mail => mail.from === person && isDownOk(mail.text, person, requestId))) return true
    } catch (error) {
      console.error(`crew down: could not read Pia's mail, will try again: ${error.message}`)
    }
    const left = deadline - now()
    if (left <= 0) return false
    await sleep(Math.min(interval, left))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew down: CREW_HOME is not set')
    process.exit(2)
  }
  const file = join(crewHome, 'crew.json')
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const parts = Array.isArray(config.up) ? config.up : []
  if (!parts.length) {
    console.error('crew down: crew.json has no "up" list, so there is nothing to take down')
    process.exit(1)
  }
  const force = process.argv.includes('--force')
  const creds = readJsonOr(join(crewHome, 'creds.json'), {})
  const piaKey = creds.people?.pia?.apiKey
  const mail = {
    base: creds.base,
    slug: creds.crew?.slug,
    key: piaKey,
    mailboxDir: join(crewHome, 'mailbox'),
    makeId: () => randomBytes(16).toString('hex')
  }
  const ask = (person, requestId, text) => askPerson({ ...mail, person, text })
  const waitFor = (person, requestId, ms) => waitForConfirmation({ ...mail, person, requestId, timeoutMs: ms })
  downParts(parts, { force, env: process.env, ask, waitFor }).then((result) => {
    for (const line of result.lines) console.log(line)
    process.exit(result.ok ? 0 : 1)
  })
}
