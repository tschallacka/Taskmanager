// What a team may set as the columns of a new board. The cleaning rules are pure; the
// stored settings need the dev database (DATABASE_URL). Run:
//   DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/team-defaults.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'

const { db } = await import('../server/db')
const { organization, teamSettings } = await import('../server/db/schema')
const {
  DEFAULT_COLUMNS,
  DefaultColumnsError,
  MAX_COLUMN_NAME_LENGTH,
  MAX_DEFAULT_COLUMNS,
  columnsForNewBoard,
  normaliseDefaultColumns,
  writeDefaultColumns
} = await import('../server/utils/teamSettings')

const team = `team-defaults-${randomBytes(4).toString('hex')}`

before(async () => {
  await db.insert(organization).values({ id: team, name: 'Defaults team', slug: team, createdAt: new Date() })
})

after(async () => {
  await db.delete(organization).where(eq(organization.id, team))
  await db.$client.end()
})

test('trims, collapses spaces and drops blanks and repeats ignoring case', () => {
  assert.deepEqual(normaliseDefaultColumns(['  Todo ', 'In   progress', '', 'todo', 'Done']), ['Todo', 'In progress', 'Done'])
})

test('null, undefined and a list of blanks mean the built-in set', () => {
  assert.equal(normaliseDefaultColumns(null), null)
  assert.equal(normaliseDefaultColumns(undefined), null)
  assert.equal(normaliseDefaultColumns(['', '  ']), null)
})

test('refuses what a board cannot start with', () => {
  assert.throws(() => normaliseDefaultColumns('Todo'), DefaultColumnsError)
  assert.throws(() => normaliseDefaultColumns(['Todo', 3]), DefaultColumnsError)
  assert.throws(() => normaliseDefaultColumns(['x'.repeat(MAX_COLUMN_NAME_LENGTH + 1)]), DefaultColumnsError)
  const many = Array.from({ length: MAX_DEFAULT_COLUMNS + 1 }, (_, i) => `Column ${i}`)
  assert.throws(() => normaliseDefaultColumns(many), DefaultColumnsError)
  assert.equal(normaliseDefaultColumns(many.slice(0, MAX_DEFAULT_COLUMNS))?.length, MAX_DEFAULT_COLUMNS)
})

test('a personal workspace and a team that set nothing get the built-in columns', async () => {
  assert.deepEqual(await columnsForNewBoard(null), DEFAULT_COLUMNS)
  assert.deepEqual(await columnsForNewBoard(team), DEFAULT_COLUMNS)
})

test('a team gets its own columns once it sets them, and the built-in set back when it clears them', async () => {
  await writeDefaultColumns(team, ['Ideas', 'Doing', 'Shipped'])
  assert.deepEqual(await columnsForNewBoard(team), ['Ideas', 'Doing', 'Shipped'])
  await writeDefaultColumns(team, ['Ideas', 'Review'])
  assert.deepEqual(await columnsForNewBoard(team), ['Ideas', 'Review'])
  await writeDefaultColumns(team, null)
  assert.deepEqual(await columnsForNewBoard(team), DEFAULT_COLUMNS)
  const rows = await db.select().from(teamSettings).where(eq(teamSettings.teamId, team))
  assert.equal(rows.length, 1)
})
