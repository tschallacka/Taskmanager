// The account's table list (logic): every table in the schema is classified once, so a new table cannot reach the account download (or the
// account deletion that shares this list) unnoticed. An exported table lists the columns it may export, and none of them looks like a secret.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../server/db/schema'
import { ACCOUNT_TABLES, SECRET_COLUMN } from '../server/utils/accountTables'

function schemaTables(): string[] {
  return Object.entries(schema).filter(([, value]) => value instanceof PgTable).map(([name]) => name)
}

test('every table in the schema is classified, and no classification names a table that is not there', () => {
  const tables = schemaTables().sort()
  const classified = Object.keys(ACCOUNT_TABLES).sort()
  assert.deepEqual(classified.filter(name => !tables.includes(name)), [], 'classified but not in the schema')
  assert.deepEqual(tables.filter(name => !classified.includes(name)), [], 'in the schema but not classified')
})

test('an exported table lists the columns it may export, and none of them looks like a secret', () => {
  for (const [name, entry] of Object.entries(ACCOUNT_TABLES)) {
    if (entry.class !== 'export') continue
    assert.ok(entry.fields && entry.fields.length > 0, `${name}: exported with no fields`)
    for (const field of entry.fields ?? []) {
      assert.doesNotMatch(field, SECRET_COLUMN, `${name}.${field} looks like a secret`)
    }
  }
})

test('a secret table is never exported', () => {
  for (const [name, entry] of Object.entries(ACCOUNT_TABLES)) {
    if (entry.class === 'secret') assert.equal(entry.fields, undefined, `${name} is secret and has fields`)
  }
})
