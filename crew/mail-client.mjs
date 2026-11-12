// The crew mail, client side: how a person's mailer sends through the app's endpoint, falls back to the spool, and
// delivers what it fetches. The mailer runs on the person's own machine and pulls (the server cannot push). One tick a
// minute, for each local recipient: flush the outbox (sends the endpoint did not take), then fetch the pending mail
// for the recipient, deliver each one locally once, then ack it. Nothing here prints the key.
//
// Files under CREW_HOME/mailbox: outbox/<id>.json (a send the endpoint has not taken yet), <to>/seen/<id> (a mail
// already delivered locally, written BEFORE its ack, so a failed ack is acked again later and never delivered twice),
// <to>/done/ (the old spool, moved as today). The delivered text is always `from <from_key>: <text>`, set here from the
// row, never from the text (Boss, 2026-11-12).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SEND_TIMEOUT_MS = 3000
const MAIL_ID = /^[0-9a-f]{32}$/

/** The line a person sees for one delivered mail: the sender comes from the row, not from the text. */
export function mailLine(mail) {
  return `from ${mail.from}: ${mail.text}`
}

function endpoint(base, slug, path = '') {
  return `${base.replace(/\/$/, '')}/api/crews/${encodeURIComponent(slug)}/mail${path}`
}

async function call(fetchImpl, url, init, key) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}

/**
 * Sends one mail. The id is made here, so a retry of the same send is the same row. When the endpoint does not answer
 * (or refuses for a reason that is not the sender's), the mail is written to the outbox and the next tick flushes it.
 * Returns { sent: true } or { sent: false, outbox: <path> }.
 */
export async function sendMail({ fetch: fetchImpl = fetch, base, slug, key, to, text, id, mailboxDir, makeId }) {
  const mailId = id ?? makeId()
  if (!MAIL_ID.test(mailId)) throw new Error('a mail id is 32 lowercase hex')
  try {
    await call(fetchImpl, endpoint(base, slug), { method: 'POST', body: JSON.stringify({ id: mailId, to, text }) }, key)
    return { sent: true, id: mailId }
  } catch (error) {
    if (error.status === 400 || error.status === 409 || error.status === 429) throw error
    const outbox = join(mailboxDir, 'outbox')
    mkdirSync(outbox, { recursive: true })
    const path = join(outbox, `${mailId}.json`)
    writeFileSync(path, JSON.stringify({ id: mailId, to, text, base }, null, 1), { mode: 0o600 })
    return { sent: false, id: mailId, outbox: path }
  }
}

/** Flushes the outbox: each send is posted with its own id (a repeat is harmless), then moved to outbox/done/. */
export async function flushOutbox({ fetch: fetchImpl = fetch, mailboxDir, key, slug }) {
  const outbox = join(mailboxDir, 'outbox')
  if (!existsSync(outbox)) return { flushed: 0, left: 0 }
  let flushed = 0
  let left = 0
  for (const file of readdirSync(outbox).filter(name => name.endsWith('.json'))) {
    const path = join(outbox, file)
    const item = JSON.parse(readFileSync(path, 'utf8'))
    try {
      await call(fetchImpl, endpoint(item.base, slug), { method: 'POST', body: JSON.stringify({ id: item.id, to: item.to, text: item.text }) }, key)
      mkdirSync(join(outbox, 'done'), { recursive: true })
      renameSync(path, join(outbox, 'done', file))
      flushed++
    } catch {
      left++
    }
  }
  return { flushed, left }
}

/** The undelivered mail for one recipient, oldest first (the endpoint answers at most 50 a call). */
export async function fetchMail({ fetch: fetchImpl = fetch, base, slug, key, to }) {
  const url = `${endpoint(base, slug)}?to=${encodeURIComponent(to)}`
  const answer = await call(fetchImpl, url, { method: 'GET' }, key)
  return Array.isArray(answer?.mail) ? answer.mail : []
}

/**
 * Delivers one fetched mail locally, at most once, then acks it. `seen` is written before the ack: when the ack fails,
 * the next fetch returns the same mail, it is seen, and it is acked again without a second delivery.
 * `deliver(line)` is the local delivery (terminal paste, wake, the daemon's file).
 */
export async function deliverOnce({ fetch: fetchImpl = fetch, base, slug, key, mail, to, mailboxDir, deliver }) {
  if (!MAIL_ID.test(mail.id)) return { delivered: false, acked: false, reason: 'bad id' }
  const seenDir = join(mailboxDir, to, 'seen')
  mkdirSync(seenDir, { recursive: true })
  const seenPath = join(seenDir, mail.id)
  const fresh = !existsSync(seenPath)
  if (fresh) {
    deliver(mailLine(mail))
    writeFileSync(seenPath, `${new Date().toISOString()}\n`)
  }
  try {
    await call(fetchImpl, endpoint(base, slug, `/${mail.id}/ack`), { method: 'POST', body: '{}' }, key)
    return { delivered: fresh, acked: true }
  } catch {
    return { delivered: fresh, acked: false }
  }
}

/** One tick for one local recipient: flush the outbox, fetch, deliver each mail once, ack it. Never throws. */
export async function tick({ fetch: fetchImpl = fetch, base, slug, key, to, mailboxDir, deliver }) {
  const result = { flushed: 0, delivered: 0, acked: 0, error: null }
  try {
    const flush = await flushOutbox({ fetch: fetchImpl, mailboxDir, key, slug })
    result.flushed = flush.flushed
    const mail = await fetchMail({ fetch: fetchImpl, base, slug, key, to })
    for (const item of mail) {
      const one = await deliverOnce({ fetch: fetchImpl, base, slug, key, mail: item, to, mailboxDir, deliver })
      if (one.delivered) result.delivered++
      if (one.acked) result.acked++
    }
  } catch (error) {
    result.error = error.message
  }
  return result
}
