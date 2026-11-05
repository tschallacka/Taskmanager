<script setup lang="ts">
// Who may see this account's email address. One slider, five steps, the narrowest first. The server applies
// it to every list that shows other people's addresses, so nothing here is only cosmetic.
const LEVELS = [
  { value: 'owner', label: 'Only me', detail: 'Nobody else sees your address. People you work with see your name.' },
  { value: 'manager', label: 'Managers', detail: 'Also the people who manage a board or a team you are on: team owners and admins, and project managers.' },
  { value: 'team', label: 'Team members', detail: 'Also everyone in a team you are in.' },
  { value: 'guests', label: 'Guests', detail: 'Also everyone who shares a board with you, guests and customer contacts included.' },
  { value: 'everyone', label: 'Everyone', detail: 'Every signed-in person on this instance can see your address.' }
] as const

const toast = useToast()
const { data } = useFetch<{ level: string }>('/api/settings/email-privacy', { server: false, lazy: true })

const step = ref(0)
const saving = ref(false)
// The step the server last confirmed, so a failed save can put the slider back.
const saved = ref(0)

watch(() => data.value?.level, (level) => {
  const index = LEVELS.findIndex(entry => entry.value === level)
  if (index >= 0) step.value = saved.value = index
}, { immediate: true })

const current = computed(() => LEVELS[step.value] ?? LEVELS[0])

async function save() {
  const next = LEVELS[step.value]
  if (!next || step.value === saved.value) return
  saving.value = true
  try {
    await $fetch('/api/settings/email-privacy', { method: 'PUT', body: { level: next.value } })
    saved.value = step.value
    toast.add({ title: `Your address is visible to: ${next.label.toLowerCase()}`, icon: 'i-lucide-check', duration: 2000 })
  } catch (e) {
    step.value = saved.value
    toast.add({ title: 'Could not save', description: (e as { data?: { message?: string } })?.data?.message, icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-default bg-default overflow-hidden">
    <div class="px-5 py-3 border-b border-default bg-elevated/40">
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">Who can see my email address</span>
    </div>
    <div class="px-5 py-4 space-y-3">
      <USlider
        v-model="step"
        :min="0"
        :max="LEVELS.length - 1"
        :step="1"
        :disabled="saving"
        aria-label="Who can see my email address"
        data-testid="email-privacy-slider"
        @change="save"
      />
      <div class="flex justify-between text-xs text-muted">
        <span
          v-for="(entry, index) in LEVELS"
          :key="entry.value"
          :class="index === step ? 'font-semibold text-default' : ''"
        >{{ entry.label }}</span>
      </div>
      <p
        class="text-sm text-muted"
        data-testid="email-privacy-detail"
      >
        {{ current?.detail }}
      </p>
    </div>
  </div>
</template>
