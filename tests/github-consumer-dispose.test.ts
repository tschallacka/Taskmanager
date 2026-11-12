// disposeConsumer (test support): clears the consumer's armed limit timers and releases the shared queue. Calling it twice
// is safe. Run: node --import tsx --test tests/github-consumer-dispose.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disposeConsumer } from '../server/utils/githubDeliveryConsumer'

test('disposeConsumer resolves with the count it cleared, and a second call is safe and clears nothing', async () => {
  const first = await disposeConsumer()
  assert.equal(typeof first, 'number')
  assert.ok(first >= 0)
  const second = await disposeConsumer()
  assert.equal(second, 0, 'nothing is left to clear the second time')
})
