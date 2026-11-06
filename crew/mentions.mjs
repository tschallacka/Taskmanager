#!/usr/bin/env node
// Boss's inbox for questions on the board. Pia and the crew write "@cato" (or "@boss") in a task update;
// Boss is not a board member, so no notification reaches the Owner's session. This finds those updates.
//   crew mentions [minutes]       one check: mentions from the last <minutes> (default 60), then exits
//   crew mentions --follow        checks every 60 s and prints one line per new mention, until stopped;
//                                 run it as a Monitor in Boss's session, so each mention wakes Boss
// Boards: the crew's board and, for a fork, its main board and its crew board. Key: TASKMANAGER_API_KEY
// (the Owner's key, which Boss's session already has), else the crew's boss account from creds.json.
import { pathToFileURL } from 'node:url'

export const MENTION = /@(cato|boss)\b/i

/** The updates of one task that mention Boss, are not older than `since` and were not printed before. */
export function newMentions(task, updates, since, seen) {
  const found = []
  for (const update of updates ?? []) {
    if (!update?.id || seen.has(update.id) || String(update.at) < since || !MENTION.test(String(update.body))) continue
    seen.add(update.id)
    const text = String(update.body).replace(/\s+/g, ' ').trim()
    found.push(`@cato on ${task.id} "${task.title}" by ${update.author}: ${text.length > 240 ? `${text.slice(0, 240)}…` : text}`)
  }
  return found
}

async function main() {
  const { loadCreds, loadForks } = await import('./config.mjs')
  const creds = loadCreds()
  const key = process.env.TASKMANAGER_API_KEY || creds.people?.boss?.apiKey
  if (!key) {
    console.error('crew mentions: no key. Set TASKMANAGER_API_KEY, or give creds.json a boss account.')
    return 64
  }
  const boards = new Set([creds.board?.id])
  for (const { data } of loadForks()) {
    boards.add(data.board?.id)
    boards.add(data.shadowBoard?.id)
  }
  boards.delete(undefined)
  boards.delete(null)
  let id = 1
  const call = async (name, args) => {
    const res = await fetch(`${creds.base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error(`${name} answered HTTP ${res.status}`)
    const body = await res.json()
    if (body.result?.isError) throw new Error(`${name}: ${body.result?.content?.[0]?.text ?? 'failed'}`)
    return JSON.parse(body.result?.content?.[0]?.text ?? 'null')
  }
  const seen = new Set()
  const check = async (since) => {
    const lines = []
    for (const board of boards) {
      let data
      try {
        data = await call('get_board', { board })
      } catch (error) {
        // A board this key cannot open (a crew's own unused board, say) is dropped once, with one line.
        if (!/No board/.test(error.message)) throw error
        boards.delete(board)
        lines.push(`crew mentions: board ${board} is not open to this key; no longer checked`)
        continue
      }
      const tasks = (data?.columns ?? []).flatMap(column => column.tasks ?? [])
      for (const task of tasks.filter(t => String(t.updatedAt) >= since)) {
        const full = await call('get_task', { id: task.id })
        lines.push(...newMentions(task, full?.updates, since, seen))
      }
    }
    return lines
  }

  if (!process.argv.includes('--follow')) {
    const minutes = Number(process.argv[2] ?? 60)
    const lines = await check(new Date(Date.now() - minutes * 60000).toISOString())
    console.log(lines.length ? lines.join('\n') : `no @cato mention in the last ${minutes} minutes`)
    return 0
  }
  // Follow: a failed check is said once, and once more when the board answers again, so silence means quiet.
  let since = new Date().toISOString()
  let failing = false
  for (;;) {
    const started = new Date().toISOString()
    try {
      const lines = await check(since)
      if (lines.length) console.log(lines.join('\n'))
      if (failing) console.log('crew mentions: the board answers again')
      failing = false
      since = started
    } catch (error) {
      if (!failing) console.log(`crew mentions: check failed (${error.message}); trying again every 60 s`)
      failing = true
    }
    await new Promise(resolve => setTimeout(resolve, 60000))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code
  }, (error) => {
    console.log(`crew mentions: ${error.message}`)
    process.exitCode = 1
  })
}
