// The Boss text the MCP server adds for the person who runs a crew. Needs the dev database and the
// Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-boss-skill.test.ts
import { after, test } from 'node:test'
import assert from 'node:assert/strict'

const { db } = await import('../server/db')
const { BOSS_SKILL, bossInstructions, setsUpCrews } = await import('../server/utils/crewBossSkill')

after(async () => {
  await db.$client.end()
})

test('a person who set up no crew gets no Boss instructions', async () => {
  assert.equal(await setsUpCrews('nobody-set-up-a-crew'), false)
  assert.equal(await bossInstructions('nobody-set-up-a-crew'), '')
})

test('the Boss text covers intake, a help request from Pia and the final review', () => {
  for (const phrase of ['Intake', 'split help', 'Final review', 'Feedback Cato', 'only you merge', 'Check your tasks regularly', 'You start Pia', 'never the go-between']) {
    assert.ok(BOSS_SKILL.includes(phrase), `missing: ${phrase}`)
  }
})
