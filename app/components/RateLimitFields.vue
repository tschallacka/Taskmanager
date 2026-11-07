<script setup lang="ts">
// The rate limits on agent calls for one level (the instance, a team or a board): "at most max in each window of
// seconds". Empty means no limit of its own at this level: the level above still applies.
const props = defineProps<{ url: string, title: string, hint: string }>()

type Kind = 'tasks' | 'pairing' | 'crews'
interface Limit { max: number, windowSeconds: number }

const KINDS: { key: Kind, label: string, unit: string }[] = [
  { key: 'tasks', label: 'Tasks created by one key', unit: 'tasks' },
  { key: 'pairing', label: 'Pairing code exchanges per address', unit: 'exchanges' },
  { key: 'crews', label: 'Crews or management tokens made per person', unit: 'crews' }
]

const DEFAULTS: Record<Kind, Limit> = {
  tasks: { max: 600, windowSeconds: 3600 },
  pairing: { max: 10, windowSeconds: 600 },
  crews: { max: 20, windowSeconds: 86400 }
}

const fields = reactive<Record<Kind, { max: string, windowSeconds: string }>>({
  tasks: { max: '', windowSeconds: '' },
  pairing: { max: '', windowSeconds: '' },
  crews: { max: '', windowSeconds: '' }
})
const saving = ref(false)
const message = ref('')
const failed = ref(false)

function errMsg(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || 'Could not save the limits'
}

async function load() {
  try {
    const data = await $fetch<{ limits: Partial<Record<Kind, Limit>> }>(props.url)
    for (const kind of KINDS) {
      const limit = data.limits[kind.key]
      fields[kind.key] = { max: limit ? String(limit.max) : '', windowSeconds: limit ? String(limit.windowSeconds) : '' }
    }
  } catch {
    // Without the limits the fields stay empty; saving them is still possible.
  }
}

async function save() {
  saving.value = true
  message.value = ''
  failed.value = false
  const body: Record<string, Limit | null> = {}
  for (const kind of KINDS) {
    const { max, windowSeconds } = fields[kind.key]
    const filled = max.trim() !== '' || windowSeconds.trim() !== ''
    body[kind.key] = filled ? { max: Number(max), windowSeconds: Number(windowSeconds) } : null
  }
  try {
    await $fetch(props.url, { method: 'PUT', body })
    message.value = 'Saved'
  } catch (e) {
    failed.value = true
    message.value = errMsg(e)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div
    class="space-y-3 rounded-xl border border-default p-3"
    data-rate-limits
  >
    <div>
      <p class="text-sm font-medium text-default">
        {{ title }}
      </p>
      <p class="text-xs text-muted">
        {{ hint }} Leave a row empty to keep the level above. Defaults: tasks {{ DEFAULTS.tasks.max }} per hour, pairing {{ DEFAULTS.pairing.max }} per 10 minutes, crews {{ DEFAULTS.crews.max }} per day.
      </p>
    </div>
    <div class="grid gap-2 sm:grid-cols-[1fr_6rem_6rem]">
      <template
        v-for="kind in KINDS"
        :key="kind.key"
      >
        <span class="self-center text-sm text-default">{{ kind.label }}</span>
        <UInput
          v-model="fields[kind.key].max"
          type="number"
          min="1"
          :placeholder="String(DEFAULTS[kind.key].max)"
          :aria-label="`${kind.label}: at most`"
        />
        <UInput
          v-model="fields[kind.key].windowSeconds"
          type="number"
          min="1"
          :placeholder="`${DEFAULTS[kind.key].windowSeconds} s`"
          :aria-label="`${kind.label}: window in seconds`"
        />
      </template>
    </div>
    <div class="flex items-center gap-3">
      <UButton
        size="sm"
        label="Save limits"
        :loading="saving"
        @click="save"
      />
      <span
        v-if="message"
        class="text-xs"
        :class="failed ? 'text-error' : 'text-muted'"
      >{{ message }}</span>
    </div>
  </div>
</template>
