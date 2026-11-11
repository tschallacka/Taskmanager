// tests/helpers/testBase.ts: a dev copy found from the checkout's lock file must run on the test's own database. Pure
// checks of the database names and the mismatch rule; no server and no database are touched. Run:
//   node --import tsx --test tests/test-base-database.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { databaseNameOf, databaseNameOfPid, devServerUsesOtherDatabase } from './helpers/testBase'

test('the database name comes from the URL, and the user and password never do', () => {
  assert.equal(databaseNameOf('postgresql://arnotes:s3cret@localhost:55433/arnotes_test_wick'), 'arnotes_test_wick')
  assert.equal(databaseNameOf('postgresql://arnotes@localhost:55433/arnotes_dev_wick'), 'arnotes_dev_wick')
  assert.equal(databaseNameOf(undefined), null)
  assert.equal(databaseNameOf('not a url'), null)
  assert.equal(databaseNameOf('postgresql://arnotes@localhost:55433/'), null)
})

test('a running dev copy is read for the database it was started with, from its environment', () => {
  const environ = 'PATH=/bin\0DATABASE_URL=postgresql://arnotes:pw@localhost:55433/arnotes_dev_wick\0PORT=3102\0'
  assert.equal(databaseNameOfPid(1, () => environ), 'arnotes_dev_wick')
  assert.equal(databaseNameOfPid(1, () => 'PATH=/bin\0PORT=3102\0'), null)
  const gone = (): string => {
    throw new Error('no such process')
  }
  assert.equal(databaseNameOfPid(1, gone), null)
})

test('a dev copy on another database is refused, and only a known pair that differs counts', () => {
  assert.equal(devServerUsesOtherDatabase('arnotes_test_wick', 'arnotes_dev_wick'), true)
  assert.equal(devServerUsesOtherDatabase('arnotes_test_wick', 'arnotes_test_wick'), false)
  assert.equal(devServerUsesOtherDatabase(null, 'arnotes_dev_wick'), false)
  assert.equal(devServerUsesOtherDatabase('arnotes_test_wick', null), false)
})
