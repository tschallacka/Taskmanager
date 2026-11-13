<script setup lang="ts">
import { countdownText, managementPrompt, refusalLink } from '~/utils/managementPrompt'

// "Put an AI crew to work on this board": makes the 10-minute token for one board and shows it once, with the copy-paste prompt
// for the agent. The token lives only in this component: it is cleared when the dialog closes or the time runs out.

const props = defineProps<{
  open: boolean
  board: { id: string, name: string } | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

interface ManagementTokenResponse {
  token: string
  key: { expiresAt: number }
  board: { id: string, name: string }
}

interface Issued {
  token: string
  expiresAt: number
  prompt: string
}

type Phase = 'idle' | 'working' | 'issued' | 'expired' | 'refused'

const toast = useToast()
const origin = import.meta.client ? window.location.origin : ''

const phase = ref<Phase>('idle')
const issued = ref<Issued | null>(null)
const refusal = ref<{ message: string, link: { label: string, to: string } | null } | null>(null)
const copied = ref(false)
const now = ref(Date.now())

let timer: ReturnType<typeof setInterval> | null = null

const countdown = computed(() => countdownText(issued.value ? issued.value.expiresAt - now.value : 0))

function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

// The token is dropped the moment its time is up, so the page no longer holds a working secret.
function tick() {
  now.value = Date.now()
  if (issued.value && issued.value.expiresAt - now.value <= 0) {
    stopTimer()
    issued.value = null
    phase.value = 'expired'
  }
}

function reset() {
  stopTimer()
  issued.value = null
  refusal.value = null
  copied.value = false
  phase.value = 'idle'
}

// Each opening starts from nothing, and each closing drops the token.
watch(() => props.open, reset)

// The crew permission for this board, asked when the window opens: where crews are off for this person, the window
// shows the one sentence the permission gives and no button. A failed check keeps the button; the make route still
// refuses with the same sentence.
const blocked = ref<string | null>(null)

async function checkPermission() {
  blocked.value = null
  if (!props.open || !props.board) return
  try {
    const answer = await $fetch<{ refusal: string | null }>(`/api/projects/${props.board.id}/crews-allowed`)
    blocked.value = answer.refusal
  } catch {
    blocked.value = null
  }
}

watch(() => [props.open, props.board?.id], checkPermission, { immediate: true })

onBeforeUnmount(stopTimer)

// The server's sentence is shown as it is. A call that failed without one gets a plain line.
function messageOf(error: unknown): string {
  const message = (error as { data?: { message?: unknown } } | null)?.data?.message
  return typeof message === 'string' && message !== '' ? message : 'Could not make the token. Try again.'
}

async function make() {
  if (!props.board) return
  const board = props.board
  phase.value = 'working'
  refusal.value = null
  try {
    const made = await $fetch<ManagementTokenResponse>('/api/settings/api-keys/management', {
      method: 'POST',
      body: { projectId: board.id }
    })
    const expiresAt = made.key.expiresAt
    issued.value = {
      token: made.token,
      expiresAt,
      prompt: managementPrompt({ origin, boardId: made.board.id, boardName: made.board.name, token: made.token, expiresAt })
    }
    phase.value = 'issued'
    now.value = Date.now()
    stopTimer()
    timer = setInterval(tick, 1000)
  } catch (error) {
    const message = messageOf(error)
    refusal.value = { message, link: refusalLink(message, board.id) }
    phase.value = 'refused'
  }
}

// The clipboard API needs a secure page and a user tap; the selection fallback covers browsers that refuse it.
function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  const done = document.execCommand('copy')
  area.remove()
  return done
}

async function copyAll() {
  if (!issued.value) return
  const text = issued.value.prompt
  let done = false
  try {
    await navigator.clipboard.writeText(text)
    done = true
  } catch {
    done = copyBySelection(text)
  }
  if (!done) {
    toast.add({ title: 'Could not copy. Select the text and copy it by hand', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  copied.value = true
  toast.add({ title: 'Token and prompt copied', icon: 'i-lucide-check', duration: 2000 })
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    :title="`Put an AI crew to work on ${board?.name ?? 'this board'}`"
    description="This makes a token for 10 minutes. Paste the prompt below into a new Claude Code session: it sets up a crew (a PM, workers and testers) that works on this board and keeps its own keys."
    :ui="{ footer: 'justify-end' }"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #body>
      <div
        class="space-y-4"
        data-management-dialog
      >
        <template v-if="phase === 'idle' || phase === 'working'">
          <p class="text-sm text-muted">
            The token works for 10 minutes and only on
            <span class="font-medium text-default">{{ board?.name }}</span>. It has no more rights than you have now, and it stops when the
            crew permission is withdrawn. It is shown once.
          </p>
          <p
            v-if="blocked"
            class="text-sm text-error"
            data-management-blocked
          >
            {{ blocked }}
          </p>
          <UButton
            v-else
            label="Get the prompt"
            icon="i-lucide-key-round"
            color="primary"
            :loading="phase === 'working'"
            :disabled="phase === 'working'"
            data-management-make
            @click="make"
          />
        </template>

        <template v-else-if="phase === 'issued' && issued">
          <p
            class="text-sm"
            data-management-countdown
          >
            Expires in
            <span class="font-mono font-semibold tabular-nums">{{ countdown }}</span>.
            After that the token stops working.
          </p>
          <div class="space-y-1.5">
            <p class="text-xs font-medium">
              Token
            </p>
            <code
              data-management-token
              class="block text-sm font-mono bg-elevated border border-default rounded-md px-3 py-2 break-all select-all"
            >{{ issued.token }}</code>
          </div>
          <div class="space-y-1.5">
            <p class="text-xs font-medium">
              Prompt for your agent
            </p>
            <pre
              data-management-prompt
              class="text-xs font-mono bg-elevated border border-default rounded-md p-3 whitespace-pre-wrap break-words max-h-72 overflow-y-auto"
            >{{ issued.prompt }}</pre>
          </div>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy token and prompt'"
            color="primary"
            block
            data-management-copy
            @click="copyAll"
          />
        </template>

        <template v-else-if="phase === 'expired'">
          <p class="text-sm text-muted">
            The token has expired and is no longer shown. Make a new one if the agent still needs to manage the crew.
          </p>
          <UButton
            label="Get a new prompt"
            icon="i-lucide-key-round"
            color="primary"
            data-management-make
            @click="make"
          />
        </template>

        <template v-else-if="phase === 'refused' && refusal">
          <p
            class="text-sm"
            data-management-refusal
          >
            {{ refusal.message }}
          </p>
          <UButton
            v-if="refusal.link"
            :to="refusal.link.to"
            :label="refusal.link.label"
            icon="i-lucide-arrow-right"
            color="primary"
            variant="soft"
            data-management-link
            @click="close"
          />
          <p
            v-else
            class="text-xs text-muted"
          >
            Ask the owner or admin of the team if you need a crew on this board.
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Close"
        color="neutral"
        variant="ghost"
        @click="close"
      />
    </template>
  </UModal>
</template>
