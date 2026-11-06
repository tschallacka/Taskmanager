import { reachOf } from './helpers/reach'
// The agent event stream follows what a key reaches: a fixed list gets its own boards, Select all gets
// every board, and a workspace grant gets that workspace's staff events. Pure: no database.
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/agent-events-reach.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deliverableTo } from '../server/utils/agentEvents'

const staffOn = (board: string, teamId: string | null) => ({ board, audience: 'staff' as const, teamId, customerId: null })
const customerOn = (board: string, teamId: string | null) => ({ board, audience: 'customer' as const, teamId, customerId: 'cust-1' })

test('a fixed-list key gets events of its ticked boards only, not of the owner\'s other boards', () => {
  const reach = reachOf({ boards: ['b1'] })
  assert.equal(deliverableTo(staffOn('b1', 'team-a'), null, reach), true)
  assert.equal(deliverableTo(staffOn('b2', 'team-a'), null, reach), false)
  assert.equal(deliverableTo(staffOn('p1', null), null, reach), false)
})

test('a Select all key gets staff events on every board and customer events on its boards', () => {
  const reach = reachOf({ all: true })
  assert.equal(deliverableTo(staffOn('b2', 'team-a'), null, reach), true)
  assert.equal(deliverableTo(customerOn('c1', 'team-b'), null, reach), true)
})

test('a workspace grant gets that workspace\'s staff events and no customer events of it', () => {
  const reach = reachOf({ workspaces: ['team-a'] })
  assert.equal(deliverableTo(staffOn('b2', 'team-a'), null, reach), true)
  assert.equal(deliverableTo(staffOn('b3', 'team-b'), null, reach), false)
  assert.equal(deliverableTo(customerOn('c1', 'team-a'), null, reach), false)
})

test('a personal workspace grant gets the owner\'s personal staff events and customer events', () => {
  const reach = reachOf({ workspaces: [null] })
  assert.equal(deliverableTo(staffOn('p1', null), null, reach), true)
  assert.equal(deliverableTo(customerOn('c1', 'team-b'), null, reach), true)
  assert.equal(deliverableTo(staffOn('b1', 'team-a'), null, reach), false)
})
