// tm.mjs loads Playwright only when it starts a browser. A static import would load it for every command, including the
// plain mcp calls that every agent makes; this checks the source keeps the import dynamic and inside the launch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./tm.mjs', import.meta.url), 'utf8')

test('tm.mjs has no static import of playwright', () => {
  assert.doesNotMatch(source, /^import .* from 'playwright'/m)
})

test('the browser launch imports playwright dynamically, and the mcp command returns before the launch', () => {
  assert.match(source, /launching = import\('playwright'\)\.then\(\(\{ chromium \}\) => chromium\.launchPersistentContext\(/)
  const mcpAt = source.indexOf('if (command === \'mcp\')')
  const launchAt = source.indexOf('launching = import(\'playwright\')')
  assert.ok(mcpAt > 0 && launchAt > mcpAt, 'the mcp branch comes before the launch, so mcp never loads playwright')
})
