// Icons come from our own server, checked in a browser (card mwjfpwrmy51vqimyvsj): the main pages request nothing from any
// host but the app's own. The browser is the Chromium the crew already has, driven over the DevTools protocol with Node's
// built-in WebSocket, so no test dependency is added.
//
// Not in the default suite (npm test runs tests/*.test.ts only). It is opt-in: it needs ICONS_BROWSER_TEST=1, a running app
// and a Chromium:
//   ICONS_BROWSER_TEST=1 ICONS_APP_URL=http://localhost:3104 CHROMIUM=/path/to/chromium node --import tsx --test tests/browser/icons-browser.test.ts
// Without the flag, or without ICONS_APP_URL or CHROMIUM, the browser run skips and says why (CI has no Chromium). It waits
// for each condition (the page's load event, then network quiet) with a 30-second timeout, and asserts no timing. It leaves
// no Chromium process behind. The request check is a pure function and always runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP = process.env.ICONS_APP_URL
const CHROMIUM = process.env.CHROMIUM
const PAGES = ['/login', '/invite/icons-check', '/projects', '/settings']
// Every wait is for a condition, and each one gives up after this long.
const WAIT_MS = 30000
// The page counts as settled when no request or response event has come for this long.
const QUIET_MS = 500

/** The request URLs that go to a host other than the app's own. data:, blob: and about: stay in the page and are not flagged. */
export function thirdPartyRequests(urls: string[], app: string): string[] {
  const own = new URL(app).host
  return urls.filter((url) => {
    const { protocol, host } = new URL(url)
    if (['data:', 'blob:', 'about:'].includes(protocol)) return false
    return host !== own
  })
}

test('a request to the Iconify API or any other host is flagged; the app\'s own host and data: are not', () => {
  const app = 'http://localhost:3110'
  const flagged = thirdPartyRequests(
    ['http://localhost:3110/_nuxt/a.js', 'data:image/svg+xml;base64,AAAA', 'blob:http://localhost:3110/x', 'https://api.iconify.design/lucide/home.svg', 'https://fonts.gstatic.com/s/inter.woff2', 'wss://other.example/socket'],
    app
  )
  assert.deepEqual(flagged, ['https://api.iconify.design/lucide/home.svg', 'https://fonts.gstatic.com/s/inter.woff2', 'wss://other.example/socket'])
})

const skip = process.env.ICONS_BROWSER_TEST !== '1' ? 'ICONS_BROWSER_TEST is not 1 (opt-in: set it to run the browser check)' : !APP ? 'ICONS_APP_URL is not set (start the app and set it to its URL)' : !CHROMIUM || !existsSync(CHROMIUM) ? 'CHROMIUM is not set or not found' : false

test('the main pages request only the app\'s own host, in a real browser, leaving no process', { skip, timeout: 2 * WAIT_MS }, async () => {
  assert.ok(APP && CHROMIUM)
  const browser = await launchBrowser(CHROMIUM)
  try {
    // One tab per page, loaded at the same time: the pages' waits overlap, which keeps the run under the budget.
    const loads = await Promise.all(PAGES.map(async (path) => {
      const page = await browser.newPage()
      return { path, requests: await page.load(new URL(path, APP).toString()) }
    }))
    for (const { path, requests } of loads) {
      assert.deepEqual(thirdPartyRequests(requests, APP), [], `${path} requested another host`)
    }
  } finally {
    await browser.close()
  }
  assert.ok(browser.exited(), 'the Chromium process is gone')
})

// --- the browser: Chromium with a DevTools socket, and a page session that records the requests it makes ---

// The DevTools messages this test reads: an event has a method and params; an answer has an id and a result or an error.
type Result = { targetId?: string, sessionId?: string, frameId?: string }
type Json = { id?: number, method?: string, sessionId?: string, params?: { url?: string, request?: { url: string } }, result?: Result, error?: { message: string } }

async function launchBrowser(chromium: string) {
  const profile = mkdtempSync(join(tmpdir(), 'icons-browser-'))
  // Its own process group, so close() can stop Chromium and every helper it started in one step.
  const proc: ChildProcess = spawn(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
  let exitCode: number | null | undefined
  proc.on('exit', (code) => {
    exitCode = code ?? -1
  })
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let err = ''
    const timer = setTimeout(() => reject(new Error('chromium did not open DevTools in 20 s')), 20000)
    proc.stderr?.on('data', (chunk) => {
      err += String(chunk)
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
    proc.on('exit', code => reject(new Error(`chromium exited with ${code}`)))
  }).catch((error) => {
    proc.kill('SIGKILL')
    rmSync(profile, { recursive: true, force: true })
    throw error
  })
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('DevTools socket failed'))
  })
  const pending = new Map<number, { resolve: (v: Result) => void, reject: (e: Error) => void }>()
  const listeners: Array<(m: Json) => void> = []
  let nextId = 0
  ws.onmessage = (ev) => {
    const m: Json = JSON.parse(String(ev.data))
    if (m.id !== undefined && pending.has(m.id)) {
      const waiter = pending.get(m.id)!
      pending.delete(m.id)
      if (m.error) waiter.reject(new Error(m.error.message))
      else waiter.resolve(m.result ?? {})
      return
    }
    for (const listener of [...listeners]) listener(m)
  }
  const send = (method: string, params: object = {}, sessionId?: string) => new Promise<Result>((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  function waitFor(match: (m: Json) => boolean, ms: number, what: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${what} did not happen in ${ms} ms`)), ms)
      const listener = (m: Json) => {
        if (!match(m)) return
        clearTimeout(timer)
        listeners.splice(listeners.indexOf(listener), 1)
        resolve()
      }
      listeners.push(listener)
    })
  }
  // Polls a condition every 50 ms until it holds, and fails with `what` when it has not held within `ms`.
  async function until(holds: () => boolean, ms: number, what: string): Promise<void> {
    const deadline = Date.now() + ms
    while (!holds()) {
      if (Date.now() >= deadline) throw new Error(`${what} did not happen in ${ms} ms`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  return {
    async newPage() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
      await send('Network.enable', {}, sessionId)
      await send('Page.enable', {}, sessionId)
      return {
        // Loads one URL and returns every request URL the page made while it loaded and settled.
        async load(url: string): Promise<string[]> {
          const requests: string[] = []
          let lastNetworkAt = Date.now()
          const onEvent = (m: Json) => {
            if (m.sessionId !== sessionId) return
            if (m.method === 'Network.requestWillBeSent' && m.params?.request?.url) requests.push(m.params.request.url)
            if (m.method === 'Network.webSocketCreated' && m.params?.url) requests.push(m.params.url)
            if (m.method?.startsWith('Network.')) lastNetworkAt = Date.now()
          }
          listeners.push(onEvent)
          try {
            const loaded = waitFor(m => m.sessionId === sessionId && m.method === 'Page.loadEventFired', WAIT_MS, `the page ${url} loading`)
            await send('Page.navigate', { url }, sessionId)
            await loaded
            // Wait until the network has been quiet for QUIET_MS: the icons and fonts the page asks for have been requested.
            await until(() => Date.now() - lastNetworkAt >= QUIET_MS, WAIT_MS, `the network going quiet on ${url}`)
          } finally {
            listeners.splice(listeners.indexOf(onEvent), 1)
          }
          return requests
        }
      }
    },
    exited: () => exitCode !== undefined,
    // Closes the socket, stops Chromium and waits until it has exited, then removes its profile.
    async close() {
      ws.close()
      // SIGKILL to the whole group: no helper is left to write into the profile after this point.
      if (exitCode === undefined && proc.pid !== undefined) {
        try {
          process.kill(-proc.pid, 'SIGKILL')
        } catch {
          proc.kill('SIGKILL')
        }
      }
      const deadline = Date.now() + 5000
      while (exitCode === undefined && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  }
}
