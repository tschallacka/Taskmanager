// Run: cd crew && node --test devadmin.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkTarget, devDatabaseUrl, sqlFor } from './devadmin.mjs'

test('a key maps to its own dev database on localhost', () => {
  assert.equal(devDatabaseUrl('wynn'), 'postgresql://arnotes@localhost:55433/arnotes_dev_wynn')
  assert.equal(checkTarget(devDatabaseUrl('wynn'), 'wynn'), null)
})

test('refuses the live dev database arnotes', () => {
  assert.match(checkTarget('postgresql://arnotes@localhost:55433/arnotes', 'wynn'), /Boss only/)
})

test('refuses any test database', () => {
  assert.match(checkTarget('postgresql://arnotes@localhost:55433/arnotes_test_wynn', 'wynn'), /test databases/)
  assert.match(checkTarget('postgresql://arnotes@localhost:55433/arnotes_test', 'wynn'), /test databases/)
})

test('refuses another person\'s dev database', () => {
  assert.match(checkTarget('postgresql://arnotes@localhost:55433/arnotes_dev_wick', 'wynn'), /is not arnotes_dev_wynn/)
})

test('refuses a host that is not localhost', () => {
  assert.match(checkTarget('postgresql://arnotes@db.example.com:55433/arnotes_dev_wynn', 'wynn'), /not localhost/)
})

test('refuses an unknown key', () => {
  assert.match(checkTarget('postgresql://arnotes@localhost:55433/arnotes_dev_bob', 'bob'), /unknown key/)
  assert.throws(() => devDatabaseUrl('bob'), /unknown key/)
})

test('refuses a URL that does not parse', () => {
  assert.match(checkTarget('not a url', 'wynn'), /does not parse/)
})

test('refuses a non-postgres URL', () => {
  assert.match(checkTarget('mysql://arnotes@localhost:3306/arnotes_dev_wynn', 'wynn'), /not a postgres URL/)
})

test('show lists admins and touches no other column', () => {
  assert.equal(sqlFor('show'), 'SELECT email FROM "user" WHERE is_instance_admin ORDER BY email;')
})

test('make-admin sets only is_instance_admin for the one email', () => {
  assert.equal(
    sqlFor('make-admin', 'a@b.example'),
    'UPDATE "user" SET is_instance_admin = true WHERE email = \'a@b.example\' RETURNING email;',
  )
})

test('make-admin refuses an email that is not a plain address', () => {
  assert.throws(() => sqlFor('make-admin', "x'; DROP TABLE \"user\"; --"), /not a plain address/)
  assert.throws(() => sqlFor('make-admin', ''), /not a plain address/)
})

test('an unknown action is refused', () => {
  assert.throws(() => sqlFor('delete', 'a@b.example'), /unknown action/)
})
