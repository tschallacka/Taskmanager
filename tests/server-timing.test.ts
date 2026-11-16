// Speed (card mwibpggpqn4ml5tmntg): protected API answers carry a Server-Timing header with the auth stage, so the split of a
// request can be read in the browser (step A). Formatter test, plus a source check that the auth middleware sets it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serverTimingHeader } from '../server/utils/serverTiming'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the header lists each stage with its duration in milliseconds, one decimal', () => {
  assert.equal(serverTimingHeader({ auth: 12.345, crew: 0.5 }), 'auth;dur=12.3, crew;dur=0.5')
})

test('a stage with no measured time is left out, and no stages give an empty header', () => {
  assert.equal(serverTimingHeader({ auth: undefined as unknown as number }), '')
  assert.equal(serverTimingHeader({}), '')
})

test('the auth middleware sets Server-Timing on protected requests, measured around the session lookup', () => {
  const middleware = read('server/middleware/requireAuth.ts')
  assert.match(middleware, /import \{ serverTimingHeader \} from '\.\.\/utils\/serverTiming'/)
  const started = middleware.indexOf('const started')
  const lookup = middleware.indexOf('await auth.api.getSession')
  assert.ok(started > 0 && lookup > started, 'the clock starts before the session lookup')
  assert.match(middleware, /setResponseHeader\(event, 'Server-Timing'/)
})
