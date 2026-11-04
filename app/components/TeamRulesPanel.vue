<script setup lang="ts">
import { format } from 'date-fns'
import { deleteTeamRule, listTeamRuleRuns, listTeamRules, updateTeamRule } from '~/composables/useTeamRules'
import type { TeamRuleItem, TeamRulesList } from '~/composables/useTeamRules'
import type { RuleRun } from '~/composables/useProjectRules'
import { ruleErrorMessage } from '~/composables/useProjectRules'

// The team's rules: one if-this-then-that rule for every board of the team. Any member reads
// them; owners and admins add, change, switch off and delete them. They run before a board's own rules.
const props = defineProps<{ teamId: string }>()

const toast = useToast()

const data = ref<TeamRulesList | null>(null)
const loading = ref(false)
// 'new' is the builder for a rule that does not exist yet; an id is the builder for that rule.
const editing = ref<string | null>(null)
const runsOf = ref<string | null>(null)
const runs = ref<RuleRun[]>([])
const runsLoading = ref(false)
const confirmDelete = ref<TeamRuleItem | null>(null)
const deleting = ref(false)

function fail(e: unknown, fallback: string) {
  toast.add({ title: ruleErrorMessage(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

async function load() {
  loading.value = true
  try {
    data.value = await listTeamRules(props.teamId)
  } catch (e) {
    fail(e, 'Could not load the team rules')
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, () => {
  editing.value = null
  runsOf.value = null
  load()
}, { immediate: true })

const rules = computed(() => data.value?.rules ?? [])
const editedRule = computed(() => rules.value.find(rule => rule.id === editing.value) ?? null)

async function saved() {
  editing.value = null
  await load()
}

async function toggle(rule: TeamRuleItem) {
  try {
    await updateTeamRule(props.teamId, rule.id, { enabled: !rule.enabled })
    await load()
  } catch (e) {
    fail(e, 'Could not switch the rule')
  }
}

async function showRuns(rule: TeamRuleItem) {
  if (runsOf.value === rule.id) {
    runsOf.value = null
    return
  }
  runsOf.value = rule.id
  runs.value = []
  runsLoading.value = true
  try {
    runs.value = await listTeamRuleRuns(props.teamId, rule.id)
  } catch (e) {
    fail(e, 'Could not load the runs')
  } finally {
    runsLoading.value = false
  }
}

async function removeRule() {
  const rule = confirmDelete.value
  if (!rule) return
  deleting.value = true
  try {
    await deleteTeamRule(props.teamId, rule.id)
    confirmDelete.value = null
    if (runsOf.value === rule.id) runsOf.value = null
    await load()
  } catch (e) {
    fail(e, 'Could not delete the rule')
  } finally {
    deleting.value = false
  }
}

const isDeleteOpen = computed({
  get: () => confirmDelete.value !== null,
  set: (open) => {
    if (!open) confirmDelete.value = null
  }
})

const OUTCOME_LABEL: Record<RuleRun['outcome'], string> = {
  ran: 'Ran',
  failed: 'Failed',
  loop_stopped: 'Stopped to prevent a loop'
}

function when(ms: number): string {
  return format(new Date(ms), 'd MMM yyyy HH:mm')
}
</script>

<template>
  <div
    class="space-y-4"
    data-team-rules
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs text-muted">
        A team rule applies to every board of this team and runs before the board's own rules. Boards that lack a column a rule names are skipped.
      </p>
      <UButton
        v-if="data?.canManage && editing === null"
        size="sm"
        icon="i-lucide-plus"
        data-team-rule-new
        @click="editing = 'new'"
      >
        New rule
      </UButton>
    </div>

    <TeamRuleBuilder
      v-if="data && editing === 'new'"
      :team-id="teamId"
      :people="data.people"
      :can-set-visibility="data.mayChangeVisibility"
      @saved="saved"
      @cancel="editing = null"
    />

    <div
      v-if="!data"
      class="py-6 text-center text-xs text-muted"
    >
      {{ loading ? 'Loading…' : 'Could not load the rules.' }}
    </div>
    <p
      v-else-if="rules.length === 0 && editing !== 'new'"
      class="py-6 text-center text-xs text-muted"
      data-team-rules-empty
    >
      No team rules yet.
    </p>

    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="rule in rules"
        :key="rule.id"
        data-team-rule
      >
        <TeamRuleBuilder
          v-if="data && editedRule && editing === rule.id"
          :team-id="teamId"
          :rule="editedRule"
          :people="data.people"
          :can-set-visibility="data.mayChangeVisibility"
          @saved="saved"
          @cancel="editing = null"
        />

        <div
          v-else
          class="rounded-xl border border-default p-3 space-y-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-medium text-default">
                <span>{{ rule.name || 'Unnamed rule' }}</span>
                <UBadge
                  size="xs"
                  variant="subtle"
                  color="neutral"
                >
                  {{ rule.mode === 'column_free' ? 'column-free' : 'by name' }}
                </UBadge>
                <UBadge
                  v-if="!rule.enabled"
                  size="xs"
                  variant="subtle"
                  color="warning"
                >
                  off
                </UBadge>
              </p>
              <p
                class="mt-1 text-xs text-muted"
                data-team-rule-description
              >
                {{ rule.description }}
              </p>
              <p
                v-if="rule.lastRun"
                class="mt-1 text-[11px] text-dimmed"
              >
                Last run {{ when(rule.lastRun.createdAt) }}: {{ OUTCOME_LABEL[rule.lastRun.outcome] }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-history"
                aria-label="Show runs"
                data-team-rule-runs
                @click="showRuns(rule)"
              />
              <template v-if="data?.canManage">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="rule.enabled ? 'i-lucide-toggle-right' : 'i-lucide-toggle-left'"
                  :aria-label="rule.enabled ? 'Switch the rule off' : 'Switch the rule on'"
                  data-team-rule-toggle
                  @click="toggle(rule)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  aria-label="Edit the rule"
                  data-team-rule-edit
                  @click="editing = rule.id"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  aria-label="Delete the rule"
                  data-team-rule-delete
                  @click="confirmDelete = rule"
                />
              </template>
            </div>
          </div>

          <div
            v-if="runsOf === rule.id"
            class="rounded-lg bg-elevated px-3 py-2 text-xs space-y-1"
            data-team-rule-run-log
          >
            <p v-if="runsLoading">
              Loading…
            </p>
            <p
              v-else-if="runs.length === 0"
              class="text-muted"
            >
              This rule has not run yet.
            </p>
            <p
              v-for="run in runs"
              :key="run.id"
              class="text-default"
            >
              <span class="text-muted">{{ when(run.createdAt) }}</span>
              {{ OUTCOME_LABEL[run.outcome] }}: {{ run.detail }}
            </p>
          </div>
        </div>
      </li>
    </ul>

    <UModal
      v-model:open="isDeleteOpen"
      title="Delete this rule?"
      :description="confirmDelete ? `${confirmDelete.name || 'This rule'} stops running on every board of the team. This cannot be undone.` : ''"
    >
      <template #body>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="deleting"
            @click="isDeleteOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="deleting"
            @click="removeRule"
          >
            Delete rule
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
