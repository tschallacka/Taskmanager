// The kit writes no bare model alias into a file a person starts from (card mwc5aicfyb9r0fvopvf). Claude Code no longer
// accepts "haiku" as a model name ("unrecognized model"), so an agent file or start command carrying it stops the crew.
// The test reads the kit's source and templates, not generated output, and fails on either form. Test files are left out.
//   node --test crew/model-alias.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Any object key set to the bare alias, quoted or not: model: haiku, default: 'haiku', usher: "haiku".
const BARE = [/model: haiku\b/, /--model haiku\b/, /\b\w+: ['"]haiku['"]/]

test('the check catches the single-quoted object form, default: \'haiku\', and the other spellings', () => {
  assert.ok(BARE.some(re => re.test('const d = { default: \'haiku\' }')))
  assert.ok(BARE.some(re => re.test('  usher: "haiku",')))
  assert.ok(BARE.some(re => re.test('model: haiku')))
  assert.ok(BARE.some(re => re.test('claude --model haiku')))
  assert.ok(!BARE.some(re => re.test('const id = \'claude-haiku-5-5\'')))
})

test('no kit source or template writes a bare model alias into a generated file or a start command', () => {
  const files = readdirSync(here).filter(f => /\.(mjs|tmpl|sh)$/.test(f) && !/\.test\.mjs$/.test(f))
  const hits = []
  for (const file of files) {
    const text = readFileSync(join(here, file), 'utf8')
    text.split('\n').forEach((line, i) => {
      if (BARE.some(re => re.test(line))) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`)
    })
  }
  assert.deepEqual(hits, [], `a bare model alias is still written:\n${hits.join('\n')}`)
})
