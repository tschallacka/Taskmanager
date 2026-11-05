<script setup lang="ts">
import { format } from 'date-fns'
import { dueDayToMs, isOverdueDay } from '~/utils/dueDate'
import { untypedFetch } from '~/utils/untypedFetch'
import type { PersonView } from '~/components/PersonCard.vue'

// Another person's profile: the boards you share with them and what is assigned to them there that you
// may read. A person you share no board with is not found.
definePageMeta({ layout: 'app' })

const route = useRoute()
const { sidebarOpen } = useSidebar()
const { session } = useAuth()

const view = ref<PersonView | null>(null)
const notFound = ref(false)
const loading = ref(true)
const draftOpen = ref(false)

const isMe = computed(() => session.value?.user.id === route.params.id)
const staffBoards = computed(() => view.value?.boards.filter(board => board.staff) ?? [])

async function load() {
  loading.value = true
  notFound.value = false
  try {
    view.value = await untypedFetch<PersonView>(`/api/people/${route.params.id}`)
  } catch {
    view.value = null
    notFound.value = true
  } finally {
    loading.value = false
  }
}
watch(() => route.params.id, load, { immediate: true })

useSeoMeta({ title: computed(() => view.value?.person.name ?? 'Profile') })
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
    <header class="flex shrink-0 items-center gap-2 px-4 py-3 lg:hidden">
      <UButton
        icon="i-lucide-panel-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Open sidebar"
        @click="sidebarOpen = true"
      />
    </header>

    <div class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 lg:px-6">
      <p
        v-if="loading"
        class="text-sm text-muted"
      >
        Loading…
      </p>
      <p
        v-else-if="notFound"
        class="rounded-xl border border-dashed border-default px-4 py-12 text-center text-sm text-muted"
        data-person-not-found
      >
        You do not share a board with this person.
      </p>

      <template v-else-if="view">
        <div class="flex items-center gap-5">
          <UAvatar
            :src="view.person.image ?? undefined"
            :alt="view.person.name"
            size="3xl"
          />
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <h1
                class="truncate text-3xl font-semibold text-default"
                data-person-name
              >
                {{ view.person.name }}
              </h1>
              <HelpHint page="basics/person-card-and-profiles">
                You see people you share a board with. The card shows what you may see of them.
              </HelpHint>
            </div>
            <p
              v-if="view.person.email"
              class="truncate text-sm text-muted"
            >
              {{ view.person.email }}
            </p>
            <UButton
              v-if="!isMe && staffBoards.length"
              label="Assign task"
              icon="i-lucide-circle-check"
              size="xs"
              color="neutral"
              variant="outline"
              class="mt-2"
              @click="draftOpen = true"
            />
          </div>
        </div>

        <div class="mt-8 grid gap-4 md:grid-cols-5">
          <section class="rounded-2xl border border-default bg-default p-5 md:col-span-3">
            <h2 class="text-base font-semibold text-default">
              Assigned tasks
            </h2>
            <p
              v-if="!view.tasks.length"
              class="py-8 text-center text-sm text-muted"
            >
              Nothing open that you can see.
            </p>
            <ul
              v-else
              class="mt-3 divide-y divide-default"
            >
              <li
                v-for="task in view.tasks"
                :key="task.id"
              >
                <NuxtLink
                  :to="`/projects/${task.projectId}?task=${task.id}`"
                  class="flex items-center gap-3 py-2 text-sm transition-colors hover:bg-elevated/50"
                >
                  <span class="min-w-0 flex-1 truncate text-default">{{ task.title }}</span>
                  <span class="hidden max-w-36 shrink-0 truncate text-xs text-dimmed sm:block">{{ task.projectName }}</span>
                  <span
                    class="shrink-0 text-xs tabular-nums"
                    :class="task.dueOn && isOverdueDay(task.dueOn) ? 'text-error' : 'text-dimmed'"
                  >{{ task.dueOn ? format(dueDayToMs(task.dueOn), 'MMM d') : '' }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section class="rounded-2xl border border-default bg-default p-5 md:col-span-2">
            <h2 class="text-base font-semibold text-default">
              Projects in common
            </h2>
            <ul class="mt-3 space-y-1">
              <li
                v-for="board in view.boards"
                :key="board.id"
              >
                <NuxtLink
                  :to="`/projects/${board.id}`"
                  class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-default transition-colors hover:bg-elevated"
                >
                  <UIcon
                    name="i-lucide-kanban"
                    class="size-4 text-primary"
                  />
                  <span class="truncate">{{ board.name }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>
        </div>

        <DraftTaskModal
          v-model:open="draftOpen"
          :person="view.person"
          :boards="staffBoards"
        />
      </template>
    </div>
  </div>
</template>
