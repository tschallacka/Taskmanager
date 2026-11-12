<script setup lang="ts">
import { format, formatDistanceToNowStrict } from 'date-fns'
import { dueDayToMs, isOverdueDay, todayIso } from '~/utils/dueDate'
import { homeStats } from '~/utils/homeStats'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Home' })

const { session } = useAuth()
const { ready, projects, allTasks, updateTask } = useProjects()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = (session.value?.user.name ?? '').split(' ')[0]
  return `Good ${part}${first ? `, ${first}` : ''}`
})

const mine = computed(() => allTasks.value.filter(task => task.assigneeId === session.value?.user.id))
const upcoming = computed(() =>
  mine.value
    .filter(task => task.completedAt == null)
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
    .slice(0, 6)
)
const completedCount = computed(() => mine.value.filter(task => task.completedAt != null).length)

// The four numbers (redesign 6/9): counted from the tasks the app has; the timer is the one the person runs now.
const { timer, load: loadTimer } = useRunningTimer()
const { items: inboxItems, unread: inboxUnread, load: loadInbox } = useNotifications()
onMounted(() => {
  loadTimer()
  loadInbox()
})
const weekStart = computed(() => {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  return monday.getTime()
})
// My tasks in three groups, by due date: Overdue, Today, then Later (undated tasks are Later).
const taskGroups = computed(() => {
  const today = todayIso()
  const overdue: typeof upcoming.value = []
  const dueToday: typeof upcoming.value = []
  const later: typeof upcoming.value = []
  for (const task of upcoming.value) {
    if (task.dueOn && isOverdueDay(task.dueOn)) overdue.push(task)
    else if (task.dueOn === today) dueToday.push(task)
    else later.push(task)
  }
  return [
    { key: 'overdue', label: 'Overdue', tasks: overdue },
    { key: 'today', label: 'Today', tasks: dueToday },
    { key: 'later', label: 'Later', tasks: later }
  ].filter(group => group.tasks.length)
})

const stats = computed(() => homeStats(allTasks.value, session.value?.user.id ?? '', todayIso(), weekStart.value))
const latestInbox = computed(() => inboxItems.value.slice(0, 3))

// Projects: each with its own tasks' progress and the latest change on them.
const HEALTH: Record<string, { label: string, cls: string }> = {
  on_track: { label: 'On track', cls: 'bg-success/15 text-success' },
  at_risk: { label: 'At risk', cls: 'bg-warning/15 text-warning' },
  off_track: { label: 'Off track', cls: 'bg-error/15 text-error' }
}
const projectRows = computed(() => projects.value.slice(0, 6).map((project) => {
  const tasks = allTasks.value.filter(task => task.projectId === project.id)
  const done = tasks.filter(task => task.completedAt != null).length
  const latest = tasks.reduce((max, task) => Math.max(max, task.updatedAt ?? 0), 0)
  return {
    project,
    total: tasks.length,
    done,
    latest,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    health: project.status ? HEALTH[project.status] ?? null : null
  }
}))

// Getting started: five steps for a new person. Three come from the data; the other two are marked when the person
// follows the link (kept on this browser only). The card leaves when all five are done or the person hides it.
const LS = { hidden: 'home.gettingStarted.hidden', invite: 'home.gettingStarted.invite', agent: 'home.gettingStarted.agent' }
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function setFlag(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch { /* a private window: the flag is simply not kept */ }
}
const gsHidden = ref(readFlag(LS.hidden))
const inviteDone = ref(readFlag(LS.invite))
const agentDone = ref(readFlag(LS.agent))
const steps = computed(() => [
  { key: 'project', label: 'Create a project', done: projects.value.length > 0, to: '/projects?new=1', mark: null as string | null },
  { key: 'task', label: 'Add a task', done: allTasks.value.length > 0, to: '/projects/my-tasks', mark: null as string | null },
  { key: 'finish', label: 'Finish one', done: allTasks.value.some(task => task.completedAt != null), to: '/projects/my-tasks', mark: null as string | null },
  { key: 'invite', label: 'Invite someone', done: inviteDone.value, to: '/team', mark: LS.invite },
  { key: 'agent', label: 'Let an agent help', done: agentDone.value, to: '/settings', mark: LS.agent }
])
const stepsDone = computed(() => steps.value.filter(step => step.done).length)
const showGettingStarted = computed(() => !gsHidden.value && stepsDone.value < steps.value.length)
function followStep(step: { to: string, mark: string | null }) {
  if (step.mark) {
    setFlag(step.mark)
    if (step.mark === LS.invite) inviteDone.value = true
    if (step.mark === LS.agent) agentDone.value = true
  }
  navigateTo(step.to)
}
function hideGettingStarted() {
  setFlag(LS.hidden)
  gsHidden.value = true
}

function openTask(task: { id: string, projectId: string }) {
  navigateTo(`/projects/${task.projectId}?task=${task.id}`)
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Home
      </h1>
    </Teleport>

    <div class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 lg:px-6">
      <p class="text-sm text-muted">
        {{ format(new Date(), 'EEEE, MMMM d') }}
      </p>
      <div class="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1
          class="text-3xl font-semibold text-default"
          data-greeting
        >
          {{ greeting }}
        </h1>
        <span class="text-sm text-muted">{{ completedCount }} {{ completedCount === 1 ? 'task' : 'tasks' }} completed</span>
      </div>

      <div
        class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4"
        data-home-stats
      >
        <div
          class="rounded-2xl border border-default bg-default p-4"
          data-stat="due-today"
        >
          <p class="text-xs text-muted">
            Due today
          </p>
          <p class="mt-1 text-2xl font-semibold text-default">
            {{ stats.dueToday }}
          </p>
        </div>
        <div
          class="rounded-2xl border border-default bg-default p-4"
          data-stat="overdue"
        >
          <p class="text-xs text-muted">
            Overdue
          </p>
          <p
            class="mt-1 text-2xl font-semibold"
            :class="stats.overdue > 0 ? 'text-error' : 'text-default'"
          >
            {{ stats.overdue }}
          </p>
        </div>
        <div
          class="rounded-2xl border border-default bg-default p-4"
          data-stat="done-this-week"
        >
          <p class="text-xs text-muted">
            Done this week
          </p>
          <p class="mt-1 text-2xl font-semibold text-default">
            {{ stats.doneThisWeek }}
          </p>
        </div>
        <div
          class="rounded-2xl border border-default bg-default p-4"
          data-stat="timer"
        >
          <p class="text-xs text-muted">
            Timer
          </p>
          <p
            v-if="timer"
            class="mt-1 flex min-w-0 items-center gap-2 text-sm text-default"
          >
            <span
              class="size-2 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span class="truncate">{{ timer.taskTitle }}</span>
          </p>
          <p
            v-else
            class="mt-1 text-sm text-muted"
          >
            None running
          </p>
        </div>
      </div>

      <section
        v-if="showGettingStarted"
        class="mt-6 rounded-2xl border border-default bg-default p-5"
        data-getting-started
      >
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-default">
              Getting started
            </h2>
            <p class="text-xs text-muted">
              {{ stepsDone }} of {{ steps.length }} done
            </p>
          </div>
          <UButton
            label="Hide"
            color="neutral"
            variant="ghost"
            size="xs"
            data-testid="getting-started-hide"
            @click="hideGettingStarted"
          />
        </div>
        <div
          class="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          :aria-valuenow="stepsDone"
          :aria-valuemax="steps.length"
          aria-label="Getting started progress"
        >
          <div
            class="h-full rounded-full bg-primary transition-all"
            :style="{ width: `${(stepsDone / steps.length) * 100}%` }"
          />
        </div>
        <ul class="mt-4 grid gap-2 sm:grid-cols-2">
          <li
            v-for="step in steps"
            :key="step.key"
            data-getting-started-step
          >
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-elevated"
              :class="step.done ? 'text-muted line-through' : 'text-default'"
              @click="followStep(step)"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-full border"
                :class="step.done ? 'border-success bg-success/15 text-success' : 'border-accented text-transparent'"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-3"
                />
              </span>
              {{ step.label }}
            </button>
          </li>
        </ul>
      </section>

      <div class="mt-6 grid gap-4 md:grid-cols-5">
        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-3">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-default">
              My tasks
            </h2>
            <NuxtLink
              to="/projects/my-tasks"
              class="text-xs text-primary hover:underline"
            >
              View all
            </NuxtLink>
          </div>
          <p
            v-if="ready && !upcoming.length"
            class="py-8 text-center text-sm text-muted"
          >
            Nothing assigned to you.
          </p>
          <div
            v-else
            class="mt-3 space-y-4"
          >
            <div
              v-for="group in taskGroups"
              :key="group.key"
              :data-home-group="group.key"
            >
              <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                {{ group.label }}
              </p>
              <ul class="mt-1 divide-y divide-default">
                <li
                  v-for="task in group.tasks"
                  :key="task.id"
                  data-home-task
                  class="flex cursor-pointer items-center gap-3 py-2 transition-colors hover:bg-elevated/50"
                  @click="openTask(task)"
                >
                  <button
                    class="flex size-5 shrink-0 items-center justify-center rounded-full border border-accented text-transparent transition-colors hover:border-success hover:text-success"
                    aria-label="Mark complete"
                    @click.stop="updateTask(task.id, { completed: true })"
                  >
                    <UIcon
                      name="i-lucide-check"
                      class="size-3"
                    />
                  </button>
                  <span class="min-w-0 flex-1 truncate text-sm text-default">{{ task.title }}</span>
                  <span
                    class="shrink-0 text-xs tabular-nums"
                    :class="task.dueOn && isOverdueDay(task.dueOn) ? 'text-error' : 'text-dimmed'"
                  >{{ task.dueOn ? format(dueDayToMs(task.dueOn), 'MMM d') : '' }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <div class="flex flex-col gap-4 md:col-span-2">
          <section
            class="rounded-2xl border border-default bg-default p-5"
            data-home-inbox
          >
            <div class="flex items-center justify-between">
              <h2 class="flex items-center gap-2 text-base font-semibold text-default">
                Inbox
                <span
                  v-if="inboxUnread > 0"
                  class="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                  data-unread
                >{{ inboxUnread }} unread</span>
              </h2>
              <NuxtLink
                to="/projects/inbox"
                class="text-xs text-primary hover:underline"
              >
                View all
              </NuxtLink>
            </div>
            <p
              v-if="!latestInbox.length"
              class="py-4 text-center text-sm text-muted"
            >
              Nothing in your inbox yet.
            </p>
            <ul
              v-else
              class="mt-3 divide-y divide-default"
            >
              <li
                v-for="item in latestInbox"
                :key="item.id"
                class="py-2"
              >
                <NuxtLink
                  :to="item.taskId ? `/projects/${item.projectId}?task=${item.taskId}` : `/projects/${item.projectId}`"
                  class="block min-w-0"
                >
                  <p
                    class="truncate text-sm"
                    :class="item.readAt ? 'text-muted' : 'font-medium text-default'"
                  >
                    {{ item.title }}
                  </p>
                  <p class="truncate text-xs text-dimmed">
                    {{ item.body }}
                  </p>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section
            class="rounded-2xl border border-default bg-default p-5"
            data-home-projects
          >
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold text-default">
                Projects
              </h2>
              <NuxtLink
                to="/projects/browse"
                class="text-xs text-primary hover:underline"
              >
                Browse
              </NuxtLink>
            </div>
            <ul class="mt-3 space-y-2">
              <li
                v-for="row in projectRows"
                :key="row.project.id"
                data-home-project
              >
                <NuxtLink
                  :to="`/projects/${row.project.id}`"
                  class="block rounded-xl border border-default p-3 transition-colors hover:bg-elevated"
                >
                  <div class="flex items-center gap-2.5">
                    <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <UIcon
                        name="i-lucide-kanban"
                        class="size-3.5"
                      />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-sm font-medium text-default">{{ row.project.name }}</span>
                    <span
                      v-if="row.health"
                      class="shrink-0 rounded-full px-2 py-0.5 text-xs"
                      :class="row.health.cls"
                    >{{ row.health.label }}</span>
                  </div>
                  <div
                    class="mt-2.5 h-1 overflow-hidden rounded-full bg-elevated"
                    role="progressbar"
                    :aria-valuenow="row.percent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div
                      class="h-full rounded-full bg-primary"
                      :style="{ width: `${row.percent}%` }"
                    />
                  </div>
                  <p class="mt-1.5 text-xs text-muted">
                    {{ row.done }} of {{ row.total }} done<span v-if="row.latest">, updated {{ formatDistanceToNowStrict(row.latest, { addSuffix: true }) }}</span>
                  </p>
                </NuxtLink>
              </li>
            </ul>
            <button
              type="button"
              class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accented px-3 py-3 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
              data-testid="home-new-project"
              @click="navigateTo('/projects?new=1')"
            >
              <UIcon
                name="i-lucide-plus"
                class="size-4"
              />
              New project
            </button>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
