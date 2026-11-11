<script setup lang="ts">
import { formatDateMention } from '~/composables/useDateMention'
import { relativeTime } from '~/composables/useRelativeTime'
import { deletionSourceLabel } from '#shared/utils/board'
import { descriptionDetails } from '~/utils/cardDetails'
import { selectChipsOf } from '~/composables/useCustomFields'
import { chipStyle } from '#shared/utils/colors'
import { dueDayToMs, isOverdueDay } from '~/utils/dueDate'
import { dayOfMs, dueSoon, labelChipsOf, stateChipsOf } from '~/utils/cardChips'
import { boardGithubBadgesOf, boardPeople, boardPerson, boardSubtasksOf } from '~/composables/useProjects'
import type { ProjectTask } from '~/composables/useProjects'

const props = defineProps<{
  task: {
    id: string
    projectId?: string
    title: string
    description: string
    tags: string[]
    visibility?: 'internal' | 'customer'
    assigneeId?: string | null
    dueOn?: string | null
    completedAt?: number | null
    deletedAt?: number | null
    deletedVia?: 'ui' | 'mcp' | 'ai' | null
    // Set from the board when the task waits for tasks that are not finished yet.
    blocked?: boolean
    blockedBy?: string[]
  }
  commentCount?: number
  // A customer contact's board: labels are shown, not recoloured, and the
  // done mark is shown but not a button.
  readonly?: boolean
  // The columns the context menu's "Move to column..." offers. Left out, the item is not shown.
  columns?: { id: string, name: string }[]
  // The board is filed under a customer: only then can a task be "Shared with customer".
  customerBoard?: boolean
}>()

const emit = defineEmits<{
  open: [taskId: string]
  restore: [taskId: string]
  purge: [taskId: string]
  toggleComplete: [taskId: string]
  assign: [taskId: string, personId: string | null]
  move: [taskId: string, columnId: string]
  delete: [taskId: string]
}>()

// A card in the board's trash is drawn in place, faded, so it is obvious both
// that it is gone and where it used to sit. It is not a link into the task
// panel: there is nothing to edit until it is back.
const trashed = computed(() => props.task.deletedAt != null)

const trashedLabel = computed(() => {
  if (!props.task.deletedAt) return ''
  return `Deleted ${relativeTime(props.task.deletedAt)}${deletionSourceLabel(props.task.deletedVia)}`
})

// Cards stay quiet: one line of plain text from the description, never rendered
// HTML. The formatted version lives in the task panel.
const details = computed(() => descriptionDetails(props.task.description ?? ''))

const snippet = computed(() => details.value.snippet)

// Both of these are read out of the description rather than stored: a checklist
// is the editor's task list, a due date is an `@date` mention. Nothing to fill
// in, and nothing that can fall out of step with what the task actually says.
const checklist = computed(() => details.value.checklist)
const checklistDone = computed(() => !!checklist.value && checklist.value.done === checklist.value.total)

// A due date set on the task wins; without one, the first `@date` in the
// description still stands in for it.
const due = computed(() => props.task.dueOn ? dueDayToMs(props.task.dueOn) : details.value.due)
const dueLabel = computed(() => due.value === null ? '' : formatDateMention(new Date(due.value).toISOString()))
const completed = computed(() => props.task.completedAt != null)
const overdue = computed(() => {
  if (completed.value || due.value === null) return false
  return props.task.dueOn ? isOverdueDay(props.task.dueOn) : due.value < Date.now()
})
const dueIsSoon = computed(() => {
  if (completed.value || overdue.value || due.value === null) return false
  return dueSoon(props.task.dueOn ?? dayOfMs(due.value))
})

// Only staff are ever sent an internal task, so the mark needs no audience check.
const internal = computed(() => props.task.visibility === 'internal')

const assignee = computed(() => boardPerson(props.task.assigneeId))

// The state chips in their fixed order, each with a reason. A customer reads "Shared with you".
const stateChips = computed(() => stateChipsOf({
  done: completed.value,
  overdue: overdue.value,
  dueSoon: dueIsSoon.value,
  blocked: !!props.task.blocked,
  blockedBy: props.task.blockedBy ? props.task.blockedBy.length : null,
  visibility: props.task.visibility,
  customerBoard: !!props.customerBoard
}).map(chip => (chip.key === 'shared' && props.readonly ? { ...chip, label: 'Shared with you' } : chip)))

// The labels on the card: the first two, then "+N".
const labelChips = computed(() => labelChipsOf(props.task.tags))

// The context menu: the same actions as the task panel's, so nothing is right-click only. "Assign to..." lists the
// people; "Move to column..." lists the columns; the done mark and the trash are the panel's too.
function copyLink() {
  const url = `${window.location.origin}/projects/${props.task.projectId ?? ''}?task=${props.task.id}`
  navigator.clipboard?.writeText(url).catch(() => {})
}

const assignChildren = computed(() => [
  [{ label: 'Unassigned', icon: 'i-lucide-user-x', onSelect: () => emit('assign', props.task.id, null) }],
  boardPeople().map(person => ({
    label: person.kind === 'customer' ? `${person.name || person.email || ''} (customer)` : person.name || person.email || '',
    avatar: { src: person.image ?? undefined, alt: person.name || person.email || '' },
    onSelect: () => emit('assign', props.task.id, person.id)
  }))
])

const menuItems = computed(() => {
  if (trashed.value) return []
  const open = { label: 'Open', icon: 'i-lucide-panel-right-open', onSelect: () => emit('open', props.task.id) }
  const copy = { label: 'Copy link', icon: 'i-lucide-link', onSelect: copyLink }
  if (props.readonly) return [[open, copy]]
  const done = {
    label: completed.value ? 'Mark as not done' : 'Mark done',
    icon: completed.value ? 'i-lucide-circle' : 'i-lucide-circle-check',
    onSelect: () => emit('toggleComplete', props.task.id)
  }
  const assign = { label: 'Assign to...', icon: 'i-lucide-user-round', children: assignChildren.value }
  const move = props.columns?.length
    ? [{
        label: 'Move to column...',
        icon: 'i-lucide-columns-3',
        children: [props.columns.map(column => ({ label: column.name, onSelect: () => emit('move', props.task.id, column.id) }))]
      }]
    : []
  // "Set due date..." opens the panel, where the date is set.
  const due = { label: 'Set due date...', icon: 'i-lucide-calendar', onSelect: () => emit('open', props.task.id) }
  const del = { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', props.task.id) }
  return [[open, done, assign, ...move, due, copy], [del]]
})

// A select field's choice, such as a priority, rides the card as a coloured chip.
const fieldChips = computed(() => selectChipsOf(props.task.projectId, props.task.id))

const cover = computed(() => /<img[^>]+src="(\/api\/attachments\/tasks\/[^"]+)"/.exec(props.task.description ?? '')?.[1] ?? null)

// The badge counts every subtask under the task, at any nesting depth, not
// just its direct children.
function allSubtasks(taskId: string): ProjectTask[] {
  const direct = boardSubtasksOf(taskId)
  return direct.flatMap(t => [t, ...allSubtasks(t.id)])
}
const subtasks = computed(() => allSubtasks(props.task.id))
const subtasksDone = computed(() => subtasks.value.filter(t => t.completedAt != null).length)

// The first GitHub item the viewer may see, drawn as "#45 merged, checks passing".
// The board sends only visible links, so a customer never gets an internal one.
const githubBadge = computed(() => {
  const badge = boardGithubBadgesOf(props.task.id)[0]
  if (!badge) return null
  const icon = {
    issue: 'i-lucide-circle-dot',
    pull: 'i-lucide-git-pull-request',
    branch: 'i-lucide-git-branch',
    workflow_run: 'i-lucide-play'
  }[badge.kind]
  let label = badge.kind === 'branch'
    ? `${badge.title ?? badge.ref}${badge.state ? `, ${badge.state}` : ''}`
    : badge.kind === 'workflow_run'
      ? `run ${badge.ref}${badge.state ? ` ${badge.state}` : ''}`
      : `#${badge.ref}${badge.state ? ` ${badge.state}` : ''}`
  if (badge.checks) label += `, checks ${badge.checks}`
  const checksTone = badge.checks === 'failing'
    ? 'text-error'
    : badge.checks === 'running' ? 'text-warning' : badge.checks === 'passing' ? 'text-success' : ''
  return { icon, label, checksTone, title: badge.title }
})

// The counts row: subtasks, checklist, comments, the first GitHub link and the assignee. Shown only with a reason.
const hasCounts = computed(() =>
  !!checklist.value || !!props.commentCount || subtasks.value.length > 0 || !!githubBadge.value || !!assignee.value
)
</script>

<template>
  <UContextMenu
    :items="menuItems"
    :disabled="trashed"
  >
    <div
      :data-id="task.id"
      :data-card-id="trashed ? undefined : task.id"
      :role="trashed ? undefined : 'button'"
      :tabindex="trashed ? undefined : 0"
      class="group rounded-lg border bg-(--tm-raised) px-3 py-2.5 transition-colors duration-150"
      :class="[
        trashed
          ? 'border-dashed border-default opacity-50 hover:opacity-100'
          : 'cursor-pointer border-default hover:bg-(--tm-hover)',
        completed && !trashed ? 'opacity-70' : ''
      ]"
      @click="trashed || $emit('open', task.id)"
      @keydown.enter.prevent="trashed || $emit('open', task.id)"
      @keydown.space.prevent="trashed || readonly || $emit('toggleComplete', task.id)"
    >
      <!-- The task's first attached image, bled to the card edges as its cover. -->
      <img
        v-if="cover && !trashed"
        :src="cover"
        alt=""
        loading="lazy"
        data-card-cover
        class="-mx-3 -mt-2.5 mb-2 aspect-[16/9] w-[calc(100%+1.5rem)] max-w-none rounded-t-lg object-cover"
      >

      <div class="flex items-start gap-1">
        <!-- The done mark: a 16 px circle in a 32 px hit area. Ticking it completes the task in place. -->
        <button
          v-if="!trashed && !readonly"
          type="button"
          class="-m-2 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
          :class="completed ? 'text-success' : 'text-dimmed hover:text-success'"
          :aria-label="completed ? 'Mark as not done' : 'Mark as done'"
          :title="completed ? 'Mark as not done' : 'Mark as done'"
          data-card-done
          @click.stop="$emit('toggleComplete', task.id)"
          @keydown.enter.stop
          @keydown.space.stop
        >
          <UIcon
            :name="completed ? 'i-lucide-circle-check' : 'i-lucide-circle'"
            class="size-4"
          />
        </button>
        <UIcon
          v-else-if="completed"
          name="i-lucide-circle-check"
          class="mt-0.5 size-4 shrink-0 text-success"
        />
        <p
          class="line-clamp-2 text-sm leading-5 font-medium"
          :class="trashed
            ? 'text-muted line-through decoration-1'
            : completed ? 'text-muted line-through decoration-1' : 'text-default'"
        >
          {{ task.title }}
        </p>
      </div>

      <p
        v-if="snippet && !completed"
        class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted"
      >
        {{ snippet }}
      </p>

      <!-- The chips row, in a fixed order: labels (two, then "+N"), the select fields, then the state chips. A finished
           task shows none of them. -->
      <div
        v-if="!completed && (labelChips.shown.length || fieldChips.length || stateChips.length)"
        class="mt-2 flex flex-wrap items-center gap-1.5"
      >
        <KanbanLabelChip
          v-for="tag in labelChips.shown"
          :key="tag"
          :tag="tag"
          :editable="!trashed && !readonly"
          chip-class="text-[0.6875rem]"
        />
        <span
          v-if="labelChips.more"
          class="text-[0.6875rem] text-dimmed"
          data-label-more
        >
          +{{ labelChips.more }}
        </span>
        <span
          v-for="chip in fieldChips"
          :key="chip.fieldId"
          class="flex min-w-0 items-center truncate rounded px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset"
          :style="chipStyle(chip.color)"
          data-field-chip
        >
          <span class="truncate">{{ chip.label }}</span>
        </span>
        <span
          v-for="chip in stateChips"
          :key="chip.key"
          class="flex min-w-0 items-center truncate rounded-(--tm-radius-pill) px-1.5 py-0.5 text-[0.6875rem] font-medium"
          :class="chip.tone === 'danger' ? 'tm-tone-danger' : chip.tone === 'warn' ? 'tm-tone-warn' : 'tm-chip'"
          :title="chip.key === 'waits' ? 'Waits for open tasks on this board' : undefined"
          :data-state-chip="chip.key"
          :data-blocked-chip="chip.key === 'waits' ? '' : undefined"
        >
          <span class="truncate">{{ chip.label }}</span>
        </span>
      </div>

      <!-- The counts: subtasks, checklist, comments, the first GitHub link, the due date, and the assignee when one is
           set (the empty slot is gone). -->
      <div
        v-if="hasCounts || (due !== null && !completed) || internal"
        class="mt-2 flex flex-wrap items-center gap-2.5 text-[0.6875rem] text-dimmed"
      >
        <span
          v-if="githubBadge"
          class="flex min-w-0 items-center gap-1"
          :class="githubBadge.checksTone"
          :title="githubBadge.title ?? undefined"
          data-github-badge
        >
          <UIcon
            :name="githubBadge.icon"
            class="size-3 shrink-0"
          />
          <span class="truncate">{{ githubBadge.label }}</span>
        </span>

        <span
          v-if="due !== null && !completed"
          class="flex items-center gap-1"
          :class="overdue ? 'font-medium text-(--tm-status-overdue)' : ''"
        >
          <UIcon
            name="i-lucide-calendar"
            class="size-3"
          />
          {{ dueLabel }}
        </span>

        <span
          v-if="checklist"
          class="flex items-center gap-1 tabular-nums"
          :class="checklistDone ? 'text-(--tm-status-on-track)' : ''"
        >
          <UIcon
            name="i-lucide-list-checks"
            class="size-3"
          />
          {{ checklist.done }}/{{ checklist.total }}
        </span>

        <span
          v-if="subtasks.length"
          class="flex items-center gap-1 tabular-nums"
          :class="subtasksDone === subtasks.length ? 'text-success' : ''"
          :title="`${subtasksDone} of ${subtasks.length} subtasks done`"
        >
          <UIcon
            name="i-lucide-list-tree"
            class="size-3"
          />
          {{ subtasksDone }}/{{ subtasks.length }}
        </span>

        <span
          v-if="commentCount"
          class="flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-message-square"
            class="size-3"
          />
          {{ commentCount }}
        </span>

        <UAvatar
          v-if="assignee"
          class="ml-auto"
          :src="assignee.image ?? undefined"
          :alt="assignee.name || assignee.email || ''"
          size="3xs"
          :title="`Assigned to ${assignee.name || assignee.email || ''}`"
          data-card-assignee
        />
      </div>

      <div
        v-if="trashed"
        class="mt-2 border-t border-default pt-2"
      >
        <p class="truncate text-[0.6875rem] text-dimmed">
          {{ trashedLabel }} · kept 7 days
        </p>
        <div class="mt-1 flex items-center gap-1">
          <UButton
            label="Restore"
            icon="i-lucide-undo-2"
            size="xs"
            color="neutral"
            variant="soft"
            @click.stop="$emit('restore', task.id)"
          />
          <UButton
            label="Delete now"
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            aria-label="Delete now"
            title="Delete now"
            @click.stop="$emit('purge', task.id)"
          />
        </div>
      </div>
    </div>
  </UContextMenu>
</template>
