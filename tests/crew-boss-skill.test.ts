// The Boss text the MCP server adds for the person who runs a crew. Needs the dev database and the
// Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-boss-skill.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'

const { db } = await import('../server/db')
const { user } = await import('../server/db/schema')
const { BOSS_SKILL, bossInstructions, setsUpCrews } = await import('../server/utils/crewBossSkill')

const tag = randomBytes(4).toString('hex')
const admin = `cbs-${tag}-admin`
const plain = `cbs-${tag}-plain`

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: admin, name: admin, email: `${admin}@staff.test`, emailVerified: true, isInstanceAdmin: true, createdAt: at, updatedAt: at })
  await db.insert(user).values({ id: plain, name: plain, email: `${plain}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
})

after(async () => {
  for (const id of [admin, plain]) await db.delete(user).where(eq(user.id, id))
  await db.$client.end()
})

test('a person who runs no crew and cannot create one gets no Boss instructions', async () => {
  assert.equal(await setsUpCrews(plain), false)
  assert.equal(await bossInstructions(plain), '')
})

test('the instance admin gets the Boss instructions before any crew exists', async () => {
  assert.equal(await setsUpCrews(admin), true)
  assert.equal(await bossInstructions(admin), BOSS_SKILL)
})

test('the Boss text covers intake, a help request from Pia and the final review', () => {
  for (const phrase of ['Intake', 'split help', 'Final review', 'Feedback Cato', 'only you merge', 'Check your tasks regularly', 'You start Pia', 'never the go-between', 'restart her']) {
    assert.ok(BOSS_SKILL.includes(phrase), `missing: ${phrase}`)
  }
})
