<script setup lang="ts">
import { format } from 'date-fns'
import { connectPrompt } from '~/utils/connectPrompt'
import type { IssuedConnection } from '~/utils/connectPrompt'

const props = defineProps<{
  issued: IssuedConnection
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const toast = useToast()
const origin = import.meta.client ? window.location.origin : ''

// The prompt carries the same key the panel shows: the code for a pairing code, the token for the token itself.
const prompt = computed(() => connectPrompt({
  origin,
  tokenName: props.issued.tokenName,
  boards: props.issued.boards,
  access: props.issued.access
}))

// A key is made at the bottom of the form, so the panel is brought into view when it appears.
const panel = ref<HTMLElement | null>(null)
onMounted(() => panel.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }))

const copied = ref<'key' | 'prompt' | null>(null)

async function copy(text: string, which: 'key' | 'prompt', title: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    toast.add({ title, icon: 'i-lucide-check', duration: 2000 })
    setTimeout(() => {
      if (copied.value === which) copied.value = null
    }, 2000)
  } catch {
    toast.add({ title: 'Could not copy. Select the text and copy it by hand', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const keyText = computed(() => {
  const access = props.issued.access
  if (access.kind === 'code') return access.code
  return access.kind === 'token' ? access.token : ''
})

function expiresText(expiresAt: number): string {
  return format(new Date(expiresAt), 'p')
}
</script>

<template>
  <section
    ref="panel"
    class="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden scroll-mt-20"
    data-connect-result
  >
    <div class="px-5 py-4 space-y-4">
      <div class="flex items-start gap-3">
        <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon
            :name="issued.access.kind === 'code' ? 'i-lucide-ticket' : 'i-lucide-key-round'"
            class="size-4 text-primary"
          />
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <p class="text-sm font-medium">
            {{ issued.title }}: {{ issued.tokenName }}
          </p>
          <p
            v-if="issued.access.kind === 'code'"
            class="text-xs text-muted"
          >
            Give your agent this code, or the prompt below. The code works once and until {{ expiresText(issued.access.expiresAt) }}. The agent exchanges it for its key, so the key itself never goes through the chat.
          </p>
          <p
            v-else-if="issued.access.kind === 'browser'"
            class="text-xs text-muted"
          >
            Nothing is shown here to copy. Give your agent the prompt below. It asks for this connection, and a link comes back
            for you to open and approve. The key is made when you approve, and it is never shown in a chat.
          </p>
          <p
            v-else
            class="text-xs text-muted"
          >
            This is the only time the key is shown. Give it to your agent through the prompt below, and do not paste it into a chat.
          </p>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Close"
          @click="emit('dismiss')"
        />
      </div>

      <div
        v-if="issued.access.kind !== 'browser'"
        class="flex flex-col sm:flex-row gap-2 min-w-0"
      >
        <code
          data-connect-key
          class="flex-1 min-w-0 text-sm font-mono bg-default border border-default rounded-md px-3 py-2 break-all"
        >{{ keyText }}</code>
        <UButton
          :icon="copied === 'key' ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied === 'key' ? 'Copied' : (issued.access.kind === 'code' ? 'Copy code' : 'Copy key')"
          color="primary"
          size="sm"
          @click="copy(keyText, 'key', issued.access.kind === 'code' ? 'Code copied' : 'Key copied')"
        />
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium">
          Prompt for your agent
        </p>
        <pre
          data-connect-prompt
          class="text-xs font-mono bg-default border border-default rounded-md p-3 whitespace-pre-wrap break-words max-h-80 overflow-y-auto"
        >{{ prompt }}</pre>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :icon="copied === 'prompt' ? 'i-lucide-check' : 'i-lucide-clipboard-list'"
            :label="copied === 'prompt' ? 'Copied' : 'Copy prompt'"
            color="primary"
            variant="soft"
            size="sm"
            @click="copy(prompt, 'prompt', 'Prompt copied')"
          />
          <p class="text-xs text-muted">
            Paste it into Claude Code. It tells the agent what it may do and what to do on a refusal.
          </p>
        </div>
      </div>

      <p
        v-if="issued.access.kind === 'code'"
        class="text-xs text-muted"
      >
        Exchanging the code replaces this connection's key. Any agent still using the old key stops working, and is told why.
      </p>
    </div>
  </section>
</template>
