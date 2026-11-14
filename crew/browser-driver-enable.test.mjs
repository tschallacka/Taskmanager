// The domain switch on a new tab (Runtime.enable and the others) when the shared browser answers late: one retry with
// twice the wait, a second timeout is the answer, and any other error is not retried. Uses a fake browser, no Chromium.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enableDomain } from './browser-driver.mjs'

function fakeBrowser(answers, callMs = 1000) {
  const calls = []
  return {
    callMs,
    calls,
    call(method, params, sessionId, ms = callMs) {
      calls.push({ method, sessionId, ms })
      const next = answers.shift()
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next ?? {})
    }
  }
}

const timeout = method => new Error(`${method} timed out after 1 seconds`)

test('a timed-out Runtime.enable is retried once with twice the wait, and the retry answers', async () => {
  const browser = fakeBrowser([timeout('Runtime.enable'), { ok: true }], 1000)
  const result = await enableDomain(browser, 'Runtime.enable', 'S1')
  assert.deepEqual(result, { ok: true })
  assert.equal(browser.calls.length, 2)
  assert.deepEqual(browser.calls[0], { method: 'Runtime.enable', sessionId: 'S1', ms: 1000 })
  assert.deepEqual(browser.calls[1], { method: 'Runtime.enable', sessionId: 'S1', ms: 2000 })
})

test('a second timeout is the answer: exactly two tries, then the timeout error surfaces', async () => {
  const browser = fakeBrowser([timeout('Runtime.enable'), timeout('Runtime.enable'), { never: true }], 1000)
  await assert.rejects(enableDomain(browser, 'Runtime.enable', 'S1'), /Runtime\.enable timed out after/)
  assert.equal(browser.calls.length, 2, 'no third try')
})

test('an answer on the first try is not retried', async () => {
  const browser = fakeBrowser([{ fine: true }], 1000)
  assert.deepEqual(await enableDomain(browser, 'Page.enable', 'S2'), { fine: true })
  assert.equal(browser.calls.length, 1)
  assert.equal(browser.calls[0].ms, 1000)
})

test('a non-timeout error is not retried and reaches the caller as is', async () => {
  const browser = fakeBrowser([new Error('No target with given id found')], 1000)
  await assert.rejects(enableDomain(browser, 'Log.enable', 'S3'), /No target with given id/)
  assert.equal(browser.calls.length, 1)
})
