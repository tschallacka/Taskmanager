import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAgentSkill } from '../server/utils/agentSkill'
import { MCP_TOOLS } from '../server/utils/mcpRegistry'

const skill = buildAgentSkill('https://example.test')

test('every tool of the registry is in the generated skill', () => {
  for (const tool of MCP_TOOLS) assert.ok(skill.includes(`\`${tool.name}\``), `${tool.name} is missing from the skill`)
})

test('every tool sits in a named group, not under Other', () => {
  const other = /### Other\n\n([\s\S]*?)(\n\n###|\n\nEach tool's full description)/.exec(skill)
  assert.equal(other, null, `these tools have no group in server/utils/agentSkill.ts: ${other?.[1]}`)
})

test('the timer tools are under Time and the help tools under Help', () => {
  const time = /### Time\n\n[\s\S]*?(?=\n\n###|\n\nEach tool)/.exec(skill)?.[0] ?? ''
  const help = /### Help\n\n[\s\S]*?(?=\n\n###|\n\nEach tool)/.exec(skill)?.[0] ?? ''
  for (const name of ['start_timer', 'stop_timer', 'log_time', 'list_time']) assert.ok(time.includes(`\`${name}\``), `${name} is not under Time`)
  for (const name of ['search_help', 'read_help']) assert.ok(help.includes(`\`${name}\``), `${name} is not under Help`)
})
