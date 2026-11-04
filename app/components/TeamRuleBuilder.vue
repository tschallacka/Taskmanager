<script setup lang="ts">
// The team rule builder: the board rule builder's trigger, conditions and actions, for every
// board of the team at once. A rule is "by name" (columns written as names, people from the
// team) or "column-free" (nothing that needs a column or a particular person). The page checks
// the rule with the model the server uses; the server checks again on save.
import { MAX_ACTIONS, MAX_CONDITIONS, MAX_RULE_NAME_LENGTH } from '~~/server/utils/ruleSpec'
import { describeTeamRule, validateTeamRule } from '~~/server/utils/teamRuleSpec'
import { createTeamRule, updateTeamRule } from '~/composables/useTeamRules'
import type { TeamRuleBody, TeamRuleItem, TeamRuleMode } from '~/composables/useTeamRules'
import { ruleErrorMessage } from '~/composables/useProjectRules'
import { ACTIONS, CONDITIONS, NO_KIND, TRIGGERS, fromStored, kindList, toStored } from '~/utils/ruleKinds'
import type { Row } from '~/utils/ruleKinds'

const props = defineProps<{
  teamId: string
  rule?: TeamRuleItem | null
  people: { id: string, name: string }[]
  // Only the team's owner may let a rule set a task's visibility.
  canSetVisibility: boolean
}>()

const emit = defineEmits<{ saved: [rule: TeamRuleItem], cancel: [] }>()

// Kinds a column-free rule cannot hold, because they need a column or a particular person.
const NEEDS_COLUMN_OR_PERSON = {
  trigger: ['task_moved'],
  condition: ['in_column'],
  action: ['move_to_column', 'assign']
}

const COLUMN_KEY = 'columnName'

const stored = props.rule ?? null
const mode = ref<TeamRuleMode>(stored?.mode ?? 'by_name')
const columnFree = computed(() => mode.value === 'column_free')

const triggerKinds = computed(() => kindList(TRIGGERS, kind => columnFree.value && NEEDS_COLUMN_OR_PERSON.trigger.includes(kind), 'needs "by name"'))
const conditionKinds = computed(() => kindList(CONDITIONS, kind => columnFree.value && NEEDS_COLUMN_OR_PERSON.condition.includes(kind), 'needs "by name"'))
const actionKinds = computed(() => kindList(
  ACTIONS,
  kind => (columnFree.value && NEEDS_COLUMN_OR_PERSON.action.includes(kind)) || (kind === 'set_visibility' && !props.canSetVisibility),
  'unavailable here'
))

// A column-free rule cannot name a person, so the pickers only offer "anyone" and "nobody".
const pickablePeople = computed(() => columnFree.value ? [] : props.people)

const name = ref(stored?.name ?? '')
const trigger = ref<Row>(stored
  ? fromStored(stored.trigger as unknown as Record<string, unknown>, TRIGGERS[stored.trigger.kind] ?? NO_KIND, COLUMN_KEY)
  : { kind: 'task_added', value: '' })
const conditions = ref<Row[]>(stored?.conditions.map(item => fromStored(item as unknown as Record<string, unknown>, CONDITIONS[item.kind] ?? NO_KIND, COLUMN_KEY)) ?? [])
const actions = ref<Row[]>(stored?.actions.map(item => fromStored(item as unknown as Record<string, unknown>, ACTIONS[item.kind] ?? NO_KIND, COLUMN_KEY)) ?? [])
if (!stored) actions.value = [{ kind: 'add_label', value: '' }]

// Switching to column-free drops what it cannot hold, so the form never shows a step the
// server would refuse. A step that needs a person's name is dropped too.
function setMode(next: TeamRuleMode) {
  mode.value = next
  if (next !== 'column_free') return
  if (NEEDS_COLUMN_OR_PERSON.trigger.includes(trigger.value.kind)) trigger.value = { kind: 'task_added', value: '' }
  else if (trigger.value.kind === 'task_assigned') trigger.value = { kind: 'task_assigned', value: '' }
  conditions.value = conditions.value
    .filter(row => !NEEDS_COLUMN_OR_PERSON.condition.includes(row.kind))
    .map(row => row.kind === 'assigned_to' ? { kind: 'assigned_to', value: '' } : row)
  actions.value = actions.value.filter(row => !NEEDS_COLUMN_OR_PERSON.action.includes(row.kind))
}

function addCondition() {
  conditions.value.push({ kind: columnFree.value ? 'has_label' : 'in_column', value: '' })
}

function addAction() {
  actions.value.push({ kind: columnFree.value ? 'add_label' : 'move_to_column', value: '' })
}

const body = computed<TeamRuleBody>(() => {
  const result: TeamRuleBody = {
    mode: mode.value,
    trigger: toStored(trigger.value, TRIGGERS[trigger.value.kind] ?? NO_KIND, COLUMN_KEY) as unknown as TeamRuleBody['trigger'],
    conditions: conditions.value.map(row => toStored(row, CONDITIONS[row.kind] ?? NO_KIND, COLUMN_KEY)) as unknown as TeamRuleBody['conditions'],
    actions: actions.value.map(row => toStored(row, ACTIONS[row.kind] ?? NO_KIND, COLUMN_KEY)) as unknown as TeamRuleBody['actions']
  }
  // An unnamed rule is sent without a name; the server reads that as no name at all.
  const text = name.value.trim()
  if (text) result.name = text
  return result
})

const checked = computed(() => validateTeamRule(body.value, {
  memberIds: props.people.map(person => person.id),
  mayChangeVisibility: props.canSetVisibility
}))
const personName = (id: string) => props.people.find(person => person.id === id)?.name ?? 'someone who is no longer on the team'
const preview = computed(() => checked.value.ok ? describeTeamRule(checked.value.rule, personName) : null)
// Only the first problem shows, so the page does not move as the rule changes.
const firstProblem = computed(() => {
  if (checked.value.ok) return ''
  const list = checked.value.problems
  return list.length > 1 ? `${list[0]} (and ${list.length - 1} more)` : (list[0] ?? '')
})

const saving = ref(false)
const saveError = ref('')

async function save() {
  if (!checked.value.ok || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const saved = props.rule
      ? await updateTeamRule(props.teamId, props.rule.id, body.value)
      : await createTeamRule(props.teamId, body.value)
    emit('saved', saved as TeamRuleItem)
  } catch (e) {
    saveError.value = ruleErrorMessage(e, 'Could not save the rule')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    class="space-y-4 rounded-xl border border-default bg-default p-4"
    data-team-rule-builder
  >
    <div>
      <label
        class="text-xs font-medium text-muted"
        for="team-rule-name"
      >Name (optional)</label>
      <input
        id="team-rule-name"
        v-model="name"
        type="text"
        :maxlength="MAX_RULE_NAME_LENGTH"
        placeholder="For example: label new tasks"
        class="mt-1 w-full rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
        data-rule-name
      >
    </div>

    <section class="space-y-2">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
        How the rule refers to columns
      </h4>
      <select
        :value="mode"
        class="rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
        data-rule-mode
        @change="setMode(($event.target as HTMLSelectElement).value as TeamRuleMode)"
      >
        <option value="by_name">
          By name: columns are written as names, people come from the team
        </option>
        <option value="column_free">
          Column-free: no columns and no particular person
        </option>
      </select>
      <p class="text-xs text-muted">
        <template v-if="columnFree">
          Runs on every board of the team, whatever its columns are called.
        </template>
        <template v-else>
          Runs on every board that has a column with that name; a board without it is skipped.
        </template>
      </p>
    </section>

    <section class="space-y-2">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
        When
      </h4>
      <KanbanProjectRuleStep
        v-model="trigger"
        :kinds="triggerKinds"
        :columns="[]"
        :people="pickablePeople"
        :labels="[]"
        column-as-text
      />
    </section>

    <section class="space-y-2">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
        If (all of these)
      </h4>
      <p
        v-if="!conditions.length"
        class="text-xs text-dimmed"
      >
        No conditions: the rule applies to every task the trigger fires for.
      </p>
      <div
        v-for="(row, index) in conditions"
        :key="index"
        class="flex items-start gap-2"
      >
        <div class="min-w-0 flex-1">
          <KanbanProjectRuleStep
            :model-value="row"
            :kinds="conditionKinds"
            :columns="[]"
            :people="pickablePeople"
            :labels="[]"
            column-as-text
            @update:model-value="conditions[index] = $event"
          />
        </div>
        <button
          class="mt-1.5 text-xs text-dimmed hover:text-error"
          :aria-label="`Remove condition ${index + 1}`"
          @click="conditions.splice(index, 1)"
        >
          Remove
        </button>
      </div>
      <button
        v-if="conditions.length < MAX_CONDITIONS"
        class="text-xs text-primary hover:underline"
        data-add-condition
        @click="addCondition"
      >
        Add a condition
      </button>
    </section>

    <section class="space-y-2">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
        Then (in this order)
      </h4>
      <div
        v-for="(row, index) in actions"
        :key="index"
        class="flex items-start gap-2"
      >
        <div class="min-w-0 flex-1">
          <KanbanProjectRuleStep
            :model-value="row"
            :kinds="actionKinds"
            :columns="[]"
            :people="pickablePeople"
            :labels="[]"
            column-as-text
            @update:model-value="actions[index] = $event"
          />
        </div>
        <button
          class="mt-1.5 text-xs text-dimmed hover:text-error"
          :aria-label="`Remove action ${index + 1}`"
          @click="actions.splice(index, 1)"
        >
          Remove
        </button>
      </div>
      <button
        v-if="actions.length < MAX_ACTIONS"
        class="text-xs text-primary hover:underline"
        data-add-action
        @click="addAction"
      >
        Add an action
      </button>
      <p
        v-if="!canSetVisibility"
        class="text-xs text-muted"
      >
        Choosing whether a task is team only or shared with the customer is for the team owner only, so that option is off here.
      </p>
      <p class="text-xs text-muted">
        A team rule runs before a board's own rules. If a step fails, the steps before it stay applied.
      </p>
    </section>

    <div
      class="flex min-h-14 items-center rounded-lg bg-elevated px-3 py-2 text-sm"
      data-rule-preview
    >
      <span
        v-if="preview"
        class="text-default"
      >{{ preview }}</span>
      <span
        v-else
        class="text-error"
        data-rule-problems
      >{{ firstProblem }}</span>
    </div>

    <p
      v-if="saveError"
      class="text-xs text-error"
      data-rule-error
    >
      {{ saveError }}
    </p>

    <div class="flex justify-end gap-2">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="emit('cancel')"
      />
      <UButton
        :label="rule ? 'Save rule' : 'Create rule'"
        size="sm"
        :disabled="!checked.ok"
        :loading="saving"
        data-rule-save
        @click="save"
      />
    </div>
  </div>
</template>
