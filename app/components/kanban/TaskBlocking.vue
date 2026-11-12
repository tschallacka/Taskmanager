<script setup lang="ts">
// The "Blocking" section of a task: the tasks that wait for this one (the inverse of Blocked by). Read-only: adding and
// removing a link stays in the waiting task's own Blocked by, which says so in one line here. A waiting task opens in
// the drawer, as a blocker does. When this task is finished, its waiting tasks read "now free".
import { untypedFetch } from '~/utils/untypedFetch'

const props = defineProps<{ taskId: string }>()

interface WaitingView {
  id: string
  title?: string
  columnId: string
  finished: boolean
}
interface BlockingView {
  waiting: WaitingView[]
  hidden: number
  count: number
  free: boolean
}

const route = useRoute()
const blocking = ref<BlockingView | null>(null)
const loadError = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    blocking.value = await untypedFetch<BlockingView>(`/api/tasks/${props.taskId}/blocking`)
  } catch {
    loadError.value = 'Could not load what waits for this task.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.taskId, load)

// A waiting task opens the drawer on it, the way a blocker does.
function openWaiting(taskId: string) {
  navigateTo({ query: { ...route.query, task: taskId } })
}

const summary = computed(() => {
  const view = blocking.value
  if (!view || view.count === 0) return 'Nothing waits for this task.'
  const waits = view.count === 1 ? '1 task waits for this one' : `${view.count} tasks wait for this one`
  return view.free ? `${waits}. This task is finished, so they are now free.` : `${waits}.`
})
</script>

<template>
  <section
    class="shrink-0 border-t border-default px-5 py-2.5"
    data-task-blocking
  >
    <p class="mb-1 text-xs font-medium text-muted">
      Blocking
      <span
        v-if="blocking && blocking.count"
        class="tabular-nums text-dimmed"
      >{{ blocking.count }}</span>
    </p>

    <p
      v-if="loadError"
      role="alert"
      class="text-xs text-error"
    >
      {{ loadError }}
    </p>
    <p
      v-else
      class="text-xs"
      :class="blocking && blocking.free ? 'text-success' : 'text-dimmed'"
      data-blocking-summary
      aria-live="polite"
    >
      {{ loading && !blocking ? 'Loading…' : summary }}
    </p>

    <ul
      v-if="blocking && blocking.waiting.length"
      class="mt-1.5 space-y-1"
      data-blocking-list
    >
      <li
        v-for="waiting in blocking.waiting"
        :key="waiting.id"
        data-blocking-item
      >
        <button
          class="flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-elevated"
          :aria-label="`${waiting.title ?? 'A task'}, ${waiting.finished ? 'finished' : 'open'}`"
          @click="openWaiting(waiting.id)"
        >
          <span class="min-w-0 flex-1 truncate">{{ waiting.title }}</span>
          <span class="shrink-0 text-xs text-dimmed">{{ waiting.finished ? 'finished' : 'open' }}</span>
        </button>
      </li>
    </ul>

    <p
      v-if="blocking && blocking.hidden > 0"
      class="mt-1 text-xs text-dimmed"
      data-blocking-hidden
    >
      {{ blocking.hidden }} more you cannot see.
    </p>
    <p
      class="mt-1.5 text-xs text-dimmed"
      data-blocking-note
    >
      Add and remove these in the waiting task's own Blocked by.
    </p>
  </section>
</template>
