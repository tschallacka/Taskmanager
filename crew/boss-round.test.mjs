// The kit carries the Boss round and the Susy watch on Pia (card mwc5y4ccau9en3m3m7b), read as text like the other template
// tests. Susy has no CronCreate (a subagent has none), so her own timer is her Monitor; Pia's cron revives Susy; Boss's round
// revives Pia and the watches. Run from the kit folder: node --test boss-round.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const read = file => readFileSync(join(KIT, file), 'utf8')
const listed = read('kit-files.txt').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))

test('Susy watches Pia: unresponsive or not setting people to work goes as @cato, without copying Pia', () => {
  const susy = read('SUSY.md.tmpl')
  assert.match(susy, /Pia watch/, 'the section is there')
  assert.match(susy, /silent or gone for 10 minutes, or without a listener of her own/, 'unresponsive: silent or gone 10+ min, or no listener')
  assert.match(susy, /idle worker, or a To do card with no assignee for 15 minutes after an @pia/, 'not setting people to work')
  assert.match(susy, /as `@cato`, and do not copy Pia/, 'the @cato goes on the card, without copying Pia')
  assert.match(susy, /Boss reads Susy's `@cato` directly for that reason, and is the stopgap/, 'Boss reads it directly; it is the stopgap')
})

test('the round prompt is a kit template, listed in kit-files.txt, and carries the round items', () => {
  assert.ok(listed.includes('BOSS-ROUND.md.tmpl'), 'the template is listed')
  const round = read('BOSS-ROUND.md.tmpl')
  assert.match(round, /crew activity/, 'checks the crew for lockups with crew activity')
  assert.match(round, /answer .*questions addressed to Boss/i, 'answers questions addressed to Boss')
  assert.match(round, /review what reached Verify/i, 'reviews what reached Verify')
  assert.match(round, /nudge .*through Pia/i, 'nudges stalled or self-terminated agents through Pia')
  assert.match(round, /re-arm .*Monitor/i, 're-arms any expired Monitor')
})

test('SKILL starts the round with CronCreate, durable, at 7 and 37 past the hour, and re-creates it on the 6th day', () => {
  const skill = read('SKILL.md')
  assert.match(skill, /CronCreate/, 'the tool is named')
  assert.match(skill, /7,37 \* \* \* \*/, 'the cron expression')
  assert.match(skill, /durable/, 'durable')
  assert.match(skill, /6th day/, 're-created on the 6th day, because a cron job expires after 7 days')
  assert.match(skill, /CREW_HOME\/BOSS-ROUND\.md\b/, 'the round prompt is the rendered file in CREW_HOME, not the raw template')
  assert.doesNotMatch(skill, /BOSS-ROUND\.md\.tmpl/, 'the raw .tmpl is never named as the prompt (its placeholders are not filled in)')
})

test('Pia\'s own CronCreate runs every 15 minutes and re-creates Susy when she is silent', () => {
  const prompts = read('PROMPTS.md.tmpl')
  assert.match(prompts, /CronCreate/, 'Pia has a cron')
  assert.match(prompts, /every 15 minutes/, 'every 15 minutes')
  assert.match(prompts, /re-create Susy/, 'Pia re-creates Susy when she is silent, gone or her cron did not fire for 20 minutes')
  assert.match(prompts, /did not fire for 20 minutes/, 'the 20-minute rule')
})

test('Boss\'s round prompt is named as the rendered file, so its placeholders are filled in (card mwc5y4ccau9en3m3m7b, QA violation)', () => {
  const prompts = read('PROMPTS.md.tmpl')
  assert.match(prompts, /\{\{crew_dir\}\}\/BOSS-ROUND\.md`/, 'PROMPTS names the rendered file in the crew folder')
  assert.doesNotMatch(prompts, /BOSS-ROUND\.md\.tmpl/, 'PROMPTS does not name the raw template')
  const rendered = read('BOSS-ROUND.md.tmpl')
  assert.match(rendered, /\{\{people\.pia\}\}/, 'the template has a placeholder that init fills in, so the rendered file is the one to read')
})
