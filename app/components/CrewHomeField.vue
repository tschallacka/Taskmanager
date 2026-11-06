<script setup lang="ts">
import { guessCrewHome, normalizeCrewHome, readCrewHome, writeCrewHome } from '~/utils/crewHome'

// The folder the crew's commands use. The Owner types it once per crew; this browser remembers it,
// and "Change" corrects it. Read after mount only, so the server and the first paint agree.
const props = defineProps<{ slug: string }>()
const home = defineModel<string>({ default: '' })

const guess = computed(() => guessCrewHome(props.slug))
const editing = ref(true)
const draft = ref('')
const remembered = ref(false)
const notKept = ref(false)
const error = ref('')

onMounted(() => {
  const saved = readCrewHome(props.slug)
  home.value = saved ?? guess.value
  remembered.value = Boolean(saved)
  editing.value = !saved
  draft.value = home.value
})

function startEdit() {
  draft.value = home.value
  error.value = ''
  editing.value = true
}

function cancel() {
  error.value = ''
  editing.value = false
}

function confirm() {
  const next = normalizeCrewHome(draft.value)
  if (!next) {
    error.value = 'Type a folder that starts with ~/ or /, with no spaces: the commands are pasted into a terminal.'
    return
  }
  home.value = next
  remembered.value = writeCrewHome(props.slug, next)
  notKept.value = !remembered.value
  error.value = ''
  editing.value = false
}
</script>

<template>
  <div
    class="rounded-lg border border-default p-4 space-y-2"
    data-crew-home
  >
    <p class="text-sm font-medium text-default">
      Crew home folder
    </p>
    <template v-if="editing">
      <p class="text-xs text-muted">
        The folder, on the machine where this crew runs, that holds <code class="font-mono">crew.json</code> and
        <code class="font-mono">creds.json</code>. The commands below use it. This browser remembers it for this crew; the server never sees it.
      </p>
      <div class="flex flex-wrap items-start gap-2">
        <UInput
          v-model="draft"
          :placeholder="guess"
          aria-label="Crew home folder"
          size="sm"
          class="flex-1 min-w-48 font-mono"
          data-crew-home-input
          @keydown.enter.prevent="confirm"
        />
        <UButton
          size="sm"
          data-crew-home-save
          @click="confirm"
        >
          Use this folder
        </UButton>
        <UButton
          v-if="remembered"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="cancel"
        >
          Cancel
        </UButton>
      </div>
      <p
        v-if="error"
        class="text-xs text-error"
      >
        {{ error }}
      </p>
    </template>
    <div
      v-else
      class="flex flex-wrap items-center gap-2"
    >
      <code
        class="font-mono text-sm break-all"
        data-crew-home-value
      >{{ home }}</code>
      <UButton
        size="xs"
        variant="link"
        class="p-0"
        data-crew-home-change
        @click="startEdit"
      >
        Change
      </UButton>
    </div>
    <p
      v-if="notKept"
      class="text-xs text-warning"
    >
      This browser would not keep the folder, so the commands show it for this page only.
    </p>
  </div>
</template>
