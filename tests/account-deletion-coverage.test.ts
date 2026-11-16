// Every column that holds a person's user id is decided for account deletion (card mwjfpokj5rvl92bserd). The test reads
// the foreign keys of every table from the schema's metadata, so a new column that points at the user table fails here
// until it has a rule in server/utils/accountRules.ts. Named columns (a person's name with no foreign key) are listed
// too. Pure: no database. Run:
//   node --import tsx --test tests/account-deletion-coverage.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '../server/db/schema'
import { ACCOUNT_RULES, EXPORT_RULES, EXPORT_SECRET_COLUMN, NAMED_PERSON_COLUMNS } from '../server/utils/accountRules'

interface Found { key: string, notNull: boolean }

function tables(): ReturnType<typeof getTableConfig>[] {
  const out: ReturnType<typeof getTableConfig>[] = []
  for (const value of Object.values(schema)) {
    try {
      out.push(getTableConfig(value as Parameters<typeof getTableConfig>[0]))
    } catch {
      // not a table (an enum, a type): skipped
    }
  }
  return out
}

// Every column whose foreign key points at the user table.
function personForeignKeys(): Found[] {
  const found: Found[] = []
  for (const config of tables()) {
    for (const fk of config.foreignKeys) {
      const ref = fk.reference()
      if (ref.foreignTable !== schema.user as never) continue
      for (const column of ref.columns) found.push({ key: `${config.name}.${column.name}`, notNull: column.notNull })
    }
  }
  return found
}

const ALL_PERSON_COLUMNS = (): Found[] => {
  const named = NAMED_PERSON_COLUMNS.map(key => ({ key, notNull: false }))
  return [...personForeignKeys(), ...named]
}

test('every foreign key to the user table has a rule for account deletion', () => {
  const unhandled = ALL_PERSON_COLUMNS().map(column => column.key).filter(key => !(key in ACCOUNT_RULES))
  assert.deepEqual(unhandled, [], `no rule for: ${unhandled.join(', ')}`)
})

test('every named person column has a rule', () => {
  for (const key of NAMED_PERSON_COLUMNS) assert.ok(key in ACCOUNT_RULES, `${key} has no rule`)
})

test('no rule is left for a column that no longer exists (a rule names a real column)', () => {
  const real = new Set<string>()
  for (const config of tables()) for (const column of config.columns) real.add(`${config.name}.${column.name}`)
  const stale = Object.keys(ACCOUNT_RULES).filter(key => !real.has(key))
  assert.deepEqual(stale, [], `stale rules: ${stale.join(', ')}`)
})

test('a null rule is only for a nullable column (a NOT NULL column cannot be cleared)', () => {
  const notNull = new Map(ALL_PERSON_COLUMNS().map(column => [column.key, column.notNull]))
  for (const [key, rule] of Object.entries(ACCOUNT_RULES)) {
    if (rule !== 'null') continue
    assert.equal(notNull.get(key) ?? false, false, `${key} is NOT NULL, so it cannot be set to null`)
  }
})

test('a NOT NULL person column keeps its row: delete or tombstone, never null', () => {
  for (const column of personForeignKeys().filter(column => column.notNull)) {
    assert.notEqual(ACCOUNT_RULES[column.key as keyof typeof ACCOUNT_RULES], undefined, column.key)
    assert.notEqual(ACCOUNT_RULES[column.key as keyof typeof ACCOUNT_RULES], 'null', column.key)
  }
})

// The download (Art. 20, card mwjfpr8phz5gi4bdjqa) reads the same walk: every table that holds a person's id has a decision
// in EXPORT_RULES, either exported (an allow-list of fields, for the rows whose `by` column is the person) or not, with a reason.
const personTables = (): string[] => [...new Set(ALL_PERSON_COLUMNS().map(column => column.key.split('.')[0]!))]

test('every table that holds a person id has a download decision: exported, or not, with the reason', () => {
  const missing = personTables().filter(table => !(table in EXPORT_RULES))
  assert.deepEqual(missing, [], `no download decision for: ${missing.join(', ')}`)
})

test('a download decision names a table that holds a person id (no stale entry)', () => {
  const stale = Object.keys(EXPORT_RULES).filter(table => !personTables().includes(table))
  assert.deepEqual(stale, [], `not a person table: ${stale.join(', ')}`)
})

test('an exported table names real columns: the owner column and every field', () => {
  const columns = new Map(tables().map(config => [config.name, new Set(config.columns.map(column => column.name))]))
  for (const [table, rule] of Object.entries(EXPORT_RULES)) {
    if (rule.kind !== 'export') continue
    const real = columns.get(table)
    assert.ok(real?.has(rule.by), `${table}.${rule.by} is not a column (the owner column)`)
    for (const field of rule.fields) assert.ok(real?.has(field), `${table}.${field} is not a column`)
  }
})

test('no exported field looks like a secret: hash, token, secret, password, passkey, key, prefix, salt, otp, code, session', () => {
  for (const [table, rule] of Object.entries(EXPORT_RULES)) {
    if (rule.kind !== 'export') continue
    for (const field of rule.fields) assert.doesNotMatch(field, EXPORT_SECRET_COLUMN, `${table}.${field} looks like a secret`)
  }
})

test('every exclusion and every export says why, in words', () => {
  for (const [table, rule] of Object.entries(EXPORT_RULES)) {
    assert.ok(rule.why.trim().length >= 10, `${table}: say why`)
  }
})
