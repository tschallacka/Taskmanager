<script setup lang="ts">
import { attachTeamCrew, downloadForkFile, forkFileName, forkTeamCrew } from '~/composables/useTeamCrews'
import type { ForkResult, TeamCrewsList } from '~/composables/useTeamCrews'

// "Give a board a crew", step by step: pick the board and crew, attach, fork the members (or not), hand the
// keys to whoever runs the crew, and check it worked. The panel's form does the same in one go for people
// who know the way; this explains each step and what is easy to get wrong. Owners and admins only, as the
// panel is: the server refuses anyone else.
const props = defineProps<{
  teamId: string
  data: TeamCrewsList | null
  /** A board to start with, from the board's menu. */
  boardId?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { switchWorkspace } = useWorkspace()

const STEPS = ['Board and crew', 'Fork the members', 'Hand over the keys', 'Check it']
const step = ref(1)
const crewId = ref('')
const projectId = ref('')
const busy = ref(false)
const linkId = ref('')
const forkResult = ref<ForkResult | null>(null)
const acknowledged = ref(false)

function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || fallback
}

function fail(e: unknown, fallback: string) {
  toast.add({ title: errMsg(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

// Every time the wizard opens it starts over, with what the board's menu chose.
watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 1
  linkId.value = ''
  forkResult.value = null
  acknowledged.value = false
  projectId.value = props.boardId && props.data?.boards.some(b => b.id === props.boardId) ? props.boardId : ''
  crewId.value = props.data?.crews.length === 1 ? props.data.crews[0]!.id : ''
})

const crews = computed(() => props.data?.crews ?? [])
const boards = computed(() => props.data?.boards ?? [])
const existing = computed(() => props.data?.links.find(l => l.crewId === crewId.value && l.projectId === projectId.value && l.mine) ?? null)
const link = computed(() => props.data?.links.find(l => l.id === linkId.value) ?? null)
const crewName = computed(() => crews.value.find(c => c.id === crewId.value)?.name ?? 'the crew')
const boardName = computed(() => boards.value.find(b => b.id === projectId.value)?.name ?? 'the board')
const alreadyForked = computed(() => (link.value?.forks.length ?? 0) > 0)
const fileName = computed(() => (forkResult.value ? forkFileName(forkResult.value) : ''))
const crewSlug = computed(() => forkResult.value?.crew.slug ?? link.value?.crewSlug ?? '<crew>')

async function chooseBoard() {
  if (busy.value || !crewId.value || !projectId.value) return
  if (existing.value) {
    linkId.value = existing.value.id
    step.value = 2
    return
  }
  busy.value = true
  try {
    const made = await attachTeamCrew(props.teamId, crewId.value, projectId.value)
    linkId.value = made.id
    emit('changed')
    step.value = 2
  } catch (e) {
    fail(e, 'Could not give the board a crew')
  } finally {
    busy.value = false
  }
}

async function fork(rotate: boolean) {
  if (busy.value || !linkId.value) return
  busy.value = true
  try {
    forkResult.value = await forkTeamCrew(props.teamId, linkId.value, rotate)
    acknowledged.value = false
    emit('changed')
  } catch (e) {
    fail(e, rotate ? 'Could not make new keys' : 'Could not fork the crew')
  } finally {
    busy.value = false
  }
}

const downloaded = ref(false)
function download() {
  if (!forkResult.value) return
  downloadForkFile(forkResult.value)
  downloaded.value = true
}

// The keys are shown once. The next step stays shut until the file is saved, or the person says they have the keys.
const canLeaveFork = computed(() => !forkResult.value || downloaded.value || acknowledged.value)

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied', icon: 'i-lucide-check', duration: 1500 })
  } catch {
    toast.add({ title: 'Could not copy: select the text and copy it', icon: 'i-lucide-alert-triangle', color: 'warning' })
  }
}

const initCommand = computed(() => `CREW_HOME=~/crew-home/${crewSlug.value} node <kit folder>/init.mjs --forks ~/Downloads/${fileName.value || `forks-${crewSlug.value}-<board>.json`}`)
const sampleAgent = computed(() => forkResult.value?.members[0]?.agentType ?? link.value?.forks[0]?.agentType ?? '<agent type>')
const checkCommand = computed(() => `CREW_HOME=~/crew-home/${crewSlug.value} node <kit folder>/crew.mjs ${sampleAgent.value} mcp list_boards '{}'`)

function next() {
  if (step.value === 2) {
    // Nothing to hand over when the members were not forked: the crew's own keys already work.
    step.value = forkResult.value || alreadyForked.value ? 3 : 4
    return
  }
  step.value = Math.min(step.value + 1, STEPS.length)
}

function back() {
  if (step.value === 4 && !(forkResult.value || alreadyForked.value)) step.value = 2
  else step.value = Math.max(step.value - 1, 1)
}

async function openCrewBoard() {
  const found = link.value
  if (!found) return
  open.value = false
  if (found.inCrewTeam) await switchWorkspace(found.crewTeamId)
  await navigateTo(`/projects/${found.shadowProjectId}`)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Give a board a crew"
    description="Four steps: pick the board, fork the members if you want agents of their own, hand over the keys, check it."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div
        class="space-y-4"
        data-crew-wizard
      >
        <ol class="flex items-center gap-1.5 text-[11px] text-muted">
          <li
            v-for="(label, index) in STEPS"
            :key="label"
            class="flex min-w-0 flex-1 items-center gap-1.5"
            :class="{ 'font-medium text-default': step === index + 1 }"
          >
            <span
              class="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]"
              :class="step > index + 1 ? 'border-primary bg-primary text-inverted' : step === index + 1 ? 'border-primary text-primary' : 'border-default'"
            >
              <UIcon
                v-if="step > index + 1"
                name="i-lucide-check"
                class="size-3"
              />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="truncate">{{ label }}</span>
          </li>
        </ol>

        <!-- 1. Board and crew -->
        <section
          v-if="step === 1"
          class="space-y-3"
          data-crew-wizard-step="1"
        >
          <p class="flex items-start gap-1.5 text-sm text-default">
            <span>A crew works on a board of its own, kept in the crew's team. It reads your board and never changes it: the results are carried over by whoever runs the crew.</span>
            <HelpHint page="crews/what-is-a-crew">
              The crew is a group of AI agents (a planner, workers, a tester and a reviewer) that you set up on the Crews page. Giving a board a crew links the two.
            </HelpHint>
          </p>
          <label class="block space-y-1 text-xs text-muted">
            Crew
            <select
              v-model="crewId"
              class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
              data-crew-wizard-crew
            >
              <option
                value=""
                disabled
              >
                Pick a crew
              </option>
              <option
                v-for="crew in crews"
                :key="crew.id"
                :value="crew.id"
              >
                {{ crew.name }}
              </option>
            </select>
          </label>
          <p
            v-if="!crews.length"
            class="text-xs text-warning"
          >
            You have no crew to give. You can give only a crew you made yourself, and crews are made on the Crews page of the instance admin.
          </p>
          <label class="block space-y-1 text-xs text-muted">
            Board
            <select
              v-model="projectId"
              class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
              data-crew-wizard-board
            >
              <option
                value=""
                disabled
              >
                Pick a board
              </option>
              <option
                v-for="board in boards"
                :key="board.id"
                :value="board.id"
              >
                {{ board.name }}
              </option>
            </select>
          </label>
          <p
            v-if="existing"
            class="text-xs text-muted"
          >
            This crew already works on this board. Continue to fork its members or hand over keys.
          </p>
        </section>

        <!-- 2. Fork -->
        <section
          v-else-if="step === 2"
          class="space-y-3"
          data-crew-wizard-step="2"
        >
          <p class="text-sm text-default">
            <strong>{{ crewName }}</strong> now has a board of its own for <strong>{{ boardName }}</strong>.
          </p>
          <p class="flex items-start gap-1.5 text-sm text-default">
            <span>Next, decide whether its members work for the whole crew or get agents of their own for this board.</span>
            <HelpHint page="crews/fork-a-crew">
              A fork is a copy of each working member, named for the board (for example internal-tools-wren), with a key that reaches only this board's crew board. Skip it if the crew works on one board.
            </HelpHint>
          </p>
          <div class="rounded-lg border border-default p-3 text-xs text-muted">
            A fork makes seven accounts: the planner, four workers, the tester and the reviewer. Each key reaches only this board's crew board. The keys are shown <strong>once</strong>, so you save them in the next moment.
          </div>

          <div
            v-if="forkResult"
            class="space-y-2"
            data-crew-wizard-keys
          >
            <p class="text-sm font-medium text-default">
              The forked members
            </p>
            <div class="max-h-44 divide-y divide-default overflow-y-auto rounded-lg border border-default text-xs">
              <div
                v-for="m in forkResult.members"
                :key="m.key"
                class="px-3 py-1.5"
              >
                <p class="font-medium text-default">
                  {{ m.agentType }}
                </p>
                <p class="break-all font-mono text-muted">
                  {{ m.apiKey }}
                </p>
              </div>
            </div>
            <UButton
              icon="i-lucide-download"
              size="sm"
              data-crew-wizard-download
              @click="download"
            >
              Download {{ fileName }}
            </UButton>
            <p class="text-xs text-warning">
              Shown once. The file also holds each account's password.
            </p>
            <UCheckbox
              v-if="!downloaded"
              v-model="acknowledged"
              label="I have copied the keys myself"
              size="sm"
            />
          </div>

          <div
            v-else-if="alreadyForked"
            class="space-y-2"
          >
            <p class="text-sm text-default">
              The members are already forked for this board ({{ link?.forks.length }}). You can keep them, or make new keys, which replaces the old ones at once.
            </p>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="busy"
              @click="fork(true)"
            >
              Make new keys
            </UButton>
          </div>

          <UButton
            v-else
            icon="i-lucide-git-fork"
            size="sm"
            :loading="busy"
            data-crew-wizard-fork
            @click="fork(false)"
          >
            Fork the crew for this board
          </UButton>
        </section>

        <!-- 3. Hand over -->
        <section
          v-else-if="step === 3"
          class="space-y-3"
          data-crew-wizard-step="3"
        >
          <p class="text-sm text-default">
            Whoever runs the crew (Boss) gives the file to the crew kit. On the machine that runs the crew:
          </p>
          <ol class="list-decimal space-y-2 pl-5 text-sm text-default">
            <li>Keep <code class="rounded bg-elevated px-1 text-xs">{{ fileName || 'the forks file' }}</code> where you saved it; it holds passwords and keys, so treat it like a password.</li>
            <li>
              Run this, with the folder you unpacked the crew kit into in place of <code class="rounded bg-elevated px-1 text-xs">&lt;kit folder&gt;</code>:
              <div class="mt-1 flex items-start gap-1.5">
                <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-elevated p-2 text-[11px]">{{ initCommand }}</pre>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  aria-label="Copy the command"
                  @click="copy(initCommand)"
                />
              </div>
            </li>
            <li>Start Boss's Claude Code session after that (or send an open one a new message): Claude Code reads the new agent types then.</li>
          </ol>
          <p class="text-xs text-muted">
            It stores the file for the kit (readable by you only) and writes one agent type per fork, such as <code class="rounded bg-elevated px-1">{{ sampleAgent }}</code>.
          </p>
        </section>

        <!-- 4. Check -->
        <section
          v-else
          class="space-y-3"
          data-crew-wizard-step="4"
        >
          <p class="text-sm text-default">
            Check that it worked.
          </p>
          <ul class="space-y-2 text-sm text-default">
            <li class="flex items-start gap-2">
              <UIcon
                name="i-lucide-check"
                class="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>The board is linked: <strong>{{ crewName }}</strong> has a board of its own for <strong>{{ boardName }}</strong>.
                <UButton
                  v-if="link"
                  size="xs"
                  variant="link"
                  class="p-0"
                  data-crew-wizard-open
                  @click="openCrewBoard"
                >Open the crew board</UButton>
              </span>
            </li>
            <li
              v-if="forkResult || alreadyForked"
              class="flex items-start gap-2"
            >
              <UIcon
                name="i-lucide-terminal"
                class="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span class="min-w-0">
                A fork can read its own board. This lists only the crew board:
                <span class="mt-1 flex items-start gap-1.5">
                  <code class="min-w-0 flex-1 break-all rounded bg-elevated p-1.5 text-[11px]">{{ checkCommand }}</code>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-copy"
                    aria-label="Copy the command"
                    @click="copy(checkCommand)"
                  />
                </span>
              </span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-lucide-eye"
                class="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>The crew reads <strong>{{ boardName }}</strong> and never changes it. Results are carried over by whoever runs the crew.</span>
            </li>
          </ul>
        </section>

        <div class="flex items-center justify-between gap-2 pt-1">
          <UButton
            v-if="step > 1 && step !== 2"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="back"
          >
            Back
          </UButton>
          <span v-else />
          <div class="flex gap-2">
            <UButton
              v-if="step === 1"
              size="sm"
              :loading="busy"
              :disabled="!crewId || !projectId"
              data-crew-wizard-next
              @click="chooseBoard"
            >
              {{ existing ? 'Continue' : 'Give the board a crew' }}
            </UButton>
            <template v-else-if="step === 2">
              <UButton
                v-if="!forkResult && !alreadyForked"
                color="neutral"
                variant="soft"
                size="sm"
                @click="next"
              >
                Skip: the crew works as one
              </UButton>
              <UButton
                size="sm"
                :disabled="!canLeaveFork || (!forkResult && !alreadyForked)"
                data-crew-wizard-next
                @click="next"
              >
                Next
              </UButton>
            </template>
            <UButton
              v-else-if="step === 3"
              size="sm"
              data-crew-wizard-next
              @click="next"
            >
              Next
            </UButton>
            <UButton
              v-else
              size="sm"
              data-crew-wizard-done
              @click="open = false"
            >
              Done
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
