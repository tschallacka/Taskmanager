// A new crew's Boss account is called Cato, matching the Boss skill ("you are Boss, called Cato").
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/crew-provisioning-boss-name.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREW_PEOPLE } from '../server/utils/crewProvisioning.ts'

test('a new crew names its Boss account Cato', () => {
  const boss = CREW_PEOPLE.find(person => person.key === 'boss')
  assert.ok(boss, 'the crew has a boss key')
  assert.equal(boss.name, 'Cato')
})
