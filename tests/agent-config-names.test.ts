// Unique server names for the per-agent form (owner, 2026-11-13, on mwepy5fzg2i0jdvue7): taskmanager-<host-short>-<board
// slug>-<key slug>. Two keys or two instances never share a name; the bare name is never used. The folder form has its
// own tests in agent-config-project.test.ts. Pure. Run:
//   node --import tsx --test tests/agent-config-names.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentConfigFileText, serverNameFor } from '../app/utils/agentConfig'

const ORIGIN = 'https://tm.example.test'

test('the same person on two origins (a local dev app and the live app) gets two different server names', () => {
  const local = serverNameFor('Seed board', 'Wynn key', 'http://taskmanager.localhost')
  const live = serverNameFor('Seed board', 'Wynn key', 'https://taskmanager.tschallacka.dev')
  assert.notEqual(local, live, 'same board and key label, two origins: two names')
  assert.doesNotMatch(local, /taskmanager\.localhost|\./, 'the name is a plain slug, no dots')
})

test('the server name is taskmanager-<host-short>-<board slug>-<key slug>, never the bare name', () => {
  assert.equal(serverNameFor('Seed real board', 'Wynn laptop', ORIGIN), 'taskmanager-example-seed-real-board-wynn-laptop')
  assert.equal(serverNameFor('Seed board', 'Wynn key', 'http://taskmanager.localhost'), 'taskmanager-local-seed-board-wynn-key', 'a localhost origin reads as local')
  assert.equal(serverNameFor('Seed board', 'Wynn key', 'https://taskmanager.tschallacka.dev'), 'taskmanager-tschallacka-seed-board-wynn-key', 'the live host reads as its own short name')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), 'taskmanager')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), serverNameFor('Board B', 'Key 1'), 'two boards give two names')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), serverNameFor('Board A', 'Key 2'), 'two keys give two names')
  assert.match(serverNameFor('', ''), /^taskmanager-[a-z0-9-]+$/, 'an empty label still gives a valid name')
})

test('the per-agent file has one server, named for its key and board, and never the bare name', () => {
  const text = agentConfigFileText(ORIGIN, 'arn_x', serverNameFor('Board A', 'Key 1'))
  const config = JSON.parse(text)
  assert.deepEqual(Object.keys(config.mcpServers), ['taskmanager-board-a-key-1'])
  assert.doesNotMatch(text, /"taskmanager":/)
})
