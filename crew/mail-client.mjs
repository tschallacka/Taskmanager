// The crew mail, client side: how a person's mailer sends through the app's endpoint, falls back to the spool, and
// delivers what it fetches. The mailer runs on the person's own machine and pulls (the server cannot push). One tick a
// minute, for each local recipient: flush the outbox (sends the endpoint did not take), then fetch the pending mail
// for the recipient, deliver each one locally once, then ack it. Nothing here prints the key.
//
// Files under CREW_HOME/mailbox: outbox/<id>.json (a send the endpoint has not taken yet; outbox/bad/ holds the ones that
// cannot be read), <to>/seen/<id> (a mail already delivered locally, written BEFORE the local delivery, so a mail is
// delivered at most once; a failed ack is acked again later, never delivered again),
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
  // /api/crew-mail, not /api/crews: the crew gate answers a member key on /api/crews/* with a 404 from a remote machine.
  return `${base.replace(/\/$/, '')}/api/crew-mail/${encodeURIComponent(slug)}${path}`
}

async function call(fetchImpl, url, init, key) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}

/**
 * Sends one mail. The id is made here, so a retry of the same send is the same row. Only 401 and 403 (the key is refused)
 * are thrown. Any other failure (404, 405, 5xx, a timeout, a network error) is a fallback: by default the mail is
 * written to the outbox and the next tick flushes it; with `outbox: false` nothing is written and the caller takes its
 * own fallback (the local file path). Returns { sent: true, id } or { sent: false, id, outbox: <path or null> }.
 */
export async function sendMail({ fetch: fetchImpl = fetch, base, slug, key, to, text, id, mailboxDir, makeId, outbox: useOutbox = true }) {
  const mailId = id ?? makeId()
  if (!MAIL_ID.test(mailId)) throw new Error('a mail id is 32 lowercase hex')
  try {
    await call(fetchImpl, endpoint(base, slug), { method: 'POST', body: JSON.stringify({ id: mailId, to, text }) }, key)
    return { sent: true, id: mailId }
  } catch (error) {
    if (error.status === 401 || error.status === 403) throw error
    if (!useOutbox) return { sent: false, id: mailId, outbox: null }
    const outbox = join(mailboxDir, 'outbox')
    mkdirSync(outbox, { recursive: true })
    const path = join(outbox, `${mailId}.json`)
    // Written to a temporary name and renamed, so a crash never leaves a half-written file for the next flush to read.
    const temp = `${path}.tmp`
    writeFileSync(temp, JSON.stringify({ id: mailId, to, text, base }, null, 1), { mode: 0o600 })
    renameSync(temp, path)
    return { sent: false, id: mailId, outbox: path }
  }
}

/**
 * Flushes the outbox: each send is posted with its own id (a repeat is harmless), then moved to outbox/done/. A file that
 * cannot be read or parsed is moved to outbox/bad/ and skipped, so one bad file never stops the rest. A send the app
 * still refuses stays in the outbox (left). Returns { flushed, left, bad }.
 */
export async function flushOutbox({ fetch: fetchImpl = fetch, mailboxDir, key, slug }) {
  const outbox = join(mailboxDir, 'outbox')
  if (!existsSync(outbox)) return { flushed: 0, left: 0, bad: 0 }
  let flushed = 0
  let left = 0
  let bad = 0
  for (const file of readdirSync(outbox).filter(name => name.endsWith('.json'))) {
    const path = join(outbox, file)
    let item
    try {
      item = JSON.parse(readFileSync(path, 'utf8'))
      if (!MAIL_ID.test(item.id) || typeof item.base !== 'string') throw new Error('not an outbox mail')
    } catch {
      mkdirSync(join(outbox, 'bad'), { recursive: true })
      renameSync(path, join(outbox, 'bad', file))
      bad++
      continue
    }
    try {
      await call(fetchImpl, endpoint(item.base, slug), { method: 'POST', body: JSON.stringify({ id: item.id, to: item.to, text: item.text }) }, key)
      mkdirSync(join(outbox, 'done'), { recursive: true })
      renameSync(path, join(outbox, 'done', file))
      flushed++
    } catch {
      left++
    }
  }
  return { flushed, left, bad }
}

/** The undelivered mail for one recipient, oldest first (the endpoint answers at most 50 a call). */
export async function fetchMail({ fetch: fetchImpl = fetch, base, slug, key, to }) {
  const url = `${endpoint(base, slug)}?to=${encodeURIComponent(to)}`
  const answer = await call(fetchImpl, url, { method: 'GET' }, key)
  return Array.isArray(answer?.mail) ? answer.mail : []
}

/**
 * Delivers one fetched mail locally, at most once, then acks it. The seen record is written BEFORE the local delivery, so
 * a crash after the record and before the delivery loses that one line (at most once: never a second delivery). When the
 * ack fails, the next fetch returns the same mail, it is seen, and it is acked again without delivering it again.
 * `deliver(line, mail)` is the local delivery (terminal paste, wake, the daemon's file).
 */
export async function deliverOnce({ fetch: fetchImpl = fetch, base, slug, key, mail, to, mailboxDir, deliver }) {
  if (!MAIL_ID.test(mail.id)) return { delivered: false, acked: false, reason: 'bad id' }
  const seenDir = join(mailboxDir, to, 'seen')
  mkdirSync(seenDir, { recursive: true })
  const seenPath = join(seenDir, mail.id)
  const fresh = !existsSync(seenPath)
  if (fresh) {
    // The record keeps the mail's text and sender, so a waiter (crew down) can find a reply by its text without the inbox.
    // Mode 0o600, like the outbox file for the same text: the record holds the mail's text.
    writeFileSync(seenPath, `${JSON.stringify({ at: new Date().toISOString(), id: mail.id, from: mail.from, text: mail.text })}\n`, { mode: 0o600 })
    deliver(mailLine(mail), mail)
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
