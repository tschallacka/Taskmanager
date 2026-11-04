// The team rule model: a rule for every board of a team, with columns by name or no columns at all.
// Pure, no database. Run:
//   node --import tsx --test tests/team-rule-spec.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeTeamRule, materialiseTeamRule, validateTeamRule, columnKey } from '../server/utils/teamRuleSpec'
import type { TeamRule } from '../server/utils/teamRuleSpec'
import { conditionsHold } from '../server/utils/ruleSpec'

const context = { memberIds: ['ann', 'ben'], mayChangeVisibility: false }
const owner = { ...context, mayChangeVisibility: true }

const byName = (over: Record<string, unknown> = {}) => ({
  name: 'Done means closed',
  mode: 'by_name',
  trigger: { kind: 'task_moved', columnName: ' done ' },
  conditions: [{ kind: 'in_column', columnName: 'Done' }],
  actions: [{ kind: 'complete' }, { kind: 'move_to_column', columnName: 'Archive' }],
  ...over
})

function good(input: unknown, ctx = context): TeamRule {
  const checked = validateTeamRule(input, ctx)
  assert.ok(checked.ok, checked.ok ? '' : checked.problems.join(' | '))
  return checked.rule
}

function problems(input: unknown, ctx = context): string[] {
  const checked = validateTeamRule(input, ctx)
  assert.ok(!checked.ok, 'the rule should have been refused')
  return checked.ok ? [] : checked.problems
}

test('a by-name rule keeps its column names, trimmed, in the normal form', () => {
  const rule = good(byName())
  assert.equal(rule.mode, 'by_name')
  assert.deepEqual(rule.trigger, { kind: 'task_moved', columnName: 'done' })
  assert.deepEqual(rule.conditions, [{ kind: 'in_column', columnName: 'Done' }])
  assert.deepEqual(rule.actions, [{ kind: 'complete' }, { kind: 'move_to_column', columnName: 'Archive' }])
})

test('the mode has to be one of the two', () => {
  assert.match(problems(byName({ mode: undefined }))[0]!, /by_name or column_free/)
  assert.match(problems(byName({ mode: 'by_id' }))[0]!, /by_name or column_free/)
  assert.match(problems('nope')[0]!, /trigger/)
})

test('a column step without a usable name is refused in words about names', () => {
  const blank = problems(byName({ trigger: { kind: 'task_moved', columnName: '   ' } }))
  assert.ok(blank.some(p => /Write the column name/.test(p)), blank.join(' | '))
  const long = problems(byName({ actions: [{ kind: 'move_to_column', columnName: 'x'.repeat(41) }] }))
  assert.ok(long.some(p => /Write the column name/.test(p)), long.join(' | '))
  const ids = problems(byName({ trigger: { kind: 'task_moved', columnId: 'abc' } }))
  assert.ok(ids.some(p => /Write the column name/.test(p)), ids.join(' | '))
})

test('a by-name rule may name team members, and only team members', () => {
  good(byName({ actions: [{ kind: 'assign', assigneeId: 'ann' }] }))
  const stranger = problems(byName({ actions: [{ kind: 'assign', assigneeId: 'zed' }] }))
  assert.ok(stranger.some(p => /member of this team/.test(p)), stranger.join(' | '))
})

test('a column-free rule is refused anything that needs a column or a person', () => {
  const free = (over: Record<string, unknown>) => ({ name: 'free', mode: 'column_free', trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'new' }], ...over })
  good(free({}))
  good(free({ trigger: { kind: 'task_assigned' }, conditions: [{ kind: 'assigned_to', assigneeId: null }], actions: [{ kind: 'unassign' }] }))
  for (const bad of [
    { trigger: { kind: 'task_moved', columnName: 'Done' } },
    { trigger: { kind: 'task_assigned', assigneeId: 'ann' } },
    { conditions: [{ kind: 'in_column', columnName: 'Done' }] },
    { conditions: [{ kind: 'assigned_to', assigneeId: 'ann' }] },
    { actions: [{ kind: 'move_to_column', columnName: 'Done' }] },
    { actions: [{ kind: 'assign', assigneeId: 'ann' }] }
  ]) {
    const found = problems(free(bad))
    assert.ok(found.every(p => /column-free rule cannot use/.test(p)), found.join(' | '))
  }
})

test('only the owner may let a team rule change visibility', () => {
  const rule = byName({ actions: [{ kind: 'set_visibility', value: 'customer' }] })
  assert.ok(problems(rule).some(p => /Only the project owner/.test(p)))
  good(rule, owner)
})

test('the other board rule limits still hold', () => {
  assert.ok(problems(byName({ actions: [] })).some(p => /at least one action/.test(p)))
  assert.ok(problems(byName({ trigger: { kind: 'nope' } })).some(p => /known trigger/.test(p)))
})

const board = (names: string[]) => names.map((name, i) => ({ id: `c${i}`, name }))

test('on a board a rule becomes an ordinary rule with that board\'s column ids', () => {
  const rule = good(byName())
  const made = materialiseTeamRule(rule, board(['Backlog', 'DONE', 'archive']))
  assert.ok(made)
  assert.deepEqual(made.trigger, { kind: 'task_moved', columnId: 'c1' })
  assert.deepEqual(made.conditions, [{ kind: 'in_column', columnId: 'c1' }])
  assert.deepEqual(made.actions, [{ kind: 'complete' }, { kind: 'move_to_column', columnId: 'c2' }])
  assert.equal(conditionsHold(made.conditions, { columnId: 'c1', assigneeId: null, tags: [], dueOn: null, visibility: 'internal' }), true)
})

test('a board without one of the columns does not run the rule', () => {
  assert.equal(materialiseTeamRule(good(byName()), board(['Backlog', 'Done'])), null)
  assert.equal(materialiseTeamRule(good(byName()), []), null)
})

test('a column-free rule runs on any board, columns or none', () => {
  const rule = good({ name: 'label new', mode: 'column_free', trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'new' }] })
  assert.ok(materialiseTeamRule(rule, []))
})

test('column names compare ignoring case and spaces', () => {
  assert.equal(columnKey('  In   Progress '), columnKey('in progress'))
  const rule = good(byName({ trigger: { kind: 'task_moved', columnName: 'in   progress' }, conditions: [], actions: [{ kind: 'complete' }] }))
  assert.ok(materialiseTeamRule(rule, board(['In Progress'])))
})

test('a team rule reads as one plain sentence naming its columns', () => {
  const sentence = describeTeamRule(good(byName({ actions: [{ kind: 'assign', assigneeId: 'ann' }] })), id => (id === 'ann' ? 'Ann' : 'someone'))
  assert.match(sentence, /^When a task is moved to a column called "done", if the task is in a column called "Done": assign it to Ann\.$/)
})
