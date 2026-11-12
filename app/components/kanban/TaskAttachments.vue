<script setup lang="ts">
import { errorMessage } from '~/utils/untypedFetch'

// The images a task holds, with a delete control for staff. Deleting asks once: the first press asks, the second
// removes that one image and no other.
const props = defineProps<{ taskId: string, readonly: boolean }>()

interface Attachment { name: string, url: string }

const toast = useToast()
const attachments = ref<Attachment[]>([])
const max = ref(15)
const pending = ref<string | null>(null)
const busy = ref<string | null>(null)

async function load() {
  try {
    const res = await $fetch<{ max: number, attachments: Attachment[] }>(`/api/tasks/${props.taskId}/attachments`)
    attachments.value = res.attachments
    max.value = res.max
  } catch {
    attachments.value = []
  }
}

watch(() => props.taskId, () => {
  pending.value = null
  load()
}, { immediate: true })

async function confirmDelete(name: string) {
  busy.value = name
  try {
    await $fetch(`/api/tasks/${props.taskId}/attachments/${name}`, { method: 'DELETE' })
    attachments.value = attachments.value.filter(a => a.name !== name)
    pending.value = null
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not remove the attachment'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section
    v-if="attachments.length || !readonly"
    class="shrink-0 border-t border-default px-5 py-2.5"
    data-task-attachments
  >
    <p class="mb-1 text-xs font-medium text-muted">
      Attachments
      <span class="tabular-nums text-dimmed">{{ attachments.length }} of {{ max }}</span>
    </p>
    <ul class="space-y-1">
      <li
        v-for="a in attachments"
        :key="a.name"
        class="flex items-center gap-2 text-xs"
      >
        <img
          :src="a.url"
          :alt="a.name"
          class="h-10 w-10 shrink-0 rounded object-cover"
        >
        <span class="min-w-0 flex-1 truncate text-dimmed">{{ a.name }}</span>
        <template v-if="!readonly">
          <UButton
            v-if="pending !== a.name"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="`Delete ${a.name}`"
            @click="pending = a.name"
          />
          <template v-else>
            <span class="text-muted">Delete this image?</span>
            <UButton
              size="xs"
              color="error"
              label="Delete"
              :loading="busy === a.name"
              @click="confirmDelete(a.name)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              label="Keep"
              @click="pending = null"
            />
          </template>
        </template>
      </li>
    </ul>
  </section>
</template>
