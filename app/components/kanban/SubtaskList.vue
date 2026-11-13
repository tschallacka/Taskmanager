<script setup lang="ts">
import Sortable from 'sortablejs'
import { errorMessage } from '~/utils/untypedFetch'

const props = defineProps<{
  parentTaskId: string
  readonly: boolean
}>()

const {
  subtasks: allSubtasks,
  activeProject,
  personById,
  subtasksOf,
  createSubtask,
  updateTask,
  moveSubtask,
  deleteTask,
  isReadOnlyBoard
} = useProjects()

const toast = useToast()

// A crew's board, read through the team that keeps it, is read-only for its
// staff: the server refuses every change to it (403). The drawer only hides
// these controls for customer contacts, so the list locks itself here as well,
// and says why in one line where the add row would be (subtaskLock.ts).
const lock = computed(() => subtaskLockState({ customerReadonly: props.readonly, boardReadOnly: isReadOnlyBoard.value }))
const locked = computed(() => lock.value.locked)

const subtasks = computed(() => subtasksOf(props.parentTaskId))

// Whether this list's own owner (parentTaskId) is itself a subtask, and if so
// which task it is nested under — outdenting a row here means re-parenting it
// one level up, onto that task's own parent. A list whose owner is a top-level
// card has no such parent, so outdent is a no-op (a subtask cannot be promoted
// to a card).
const grandparentId = computed(() => {
  const owner = allSubtasks.value.find(t => t.id === props.parentTaskId)
  return owner?.parentTaskId ?? null
})

const draft = ref('')
const draftInput = ref<HTMLInputElement | null>(null)

// Enter or the "Add subtask" button adds the draft as a new row and keeps the
// field focused for the next one. An empty draft only moves the cursor there.
// A failed add puts the title back in the field and says why.
async function addSubtask() {
  const title = draft.value.trim()
  if (!title) {
    draftInput.value?.focus()
    return
  }
  if (!activeProject.value) {
    toast.add({ title: 'Could not add the subtask: its project is not loaded', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  draft.value = ''
  try {
    await createSubtask(activeProject.value.id, props.parentTaskId, title)
    await nextTick()
    draftInput.value?.focus()
  } catch (e) {
    draft.value = title
    toast.add({ title: errorMessage(e, 'Could not add the subtask'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function toggleSubtask(sub: { id: string, completedAt?: number | null }) {
  try {
    await updateTask(sub.id, { completed: sub.completedAt == null })
  } catch {
    toast.add({ title: 'Could not update the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function removeSubtask(id: string) {
  try {
    await deleteTask(id)
  } catch {
    toast.add({ title: 'Could not remove the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// ─── Inline rename / Asana-style "Enter adds the next row" ─────────────────

const rowInputs = new Map<string, HTMLInputElement>()
function setInputRef(id: string, el: Element | null) {
  if (el instanceof HTMLInputElement) rowInputs.set(id, el)
  else rowInputs.delete(id)
}
function focusRow(id: string) {
  const el = rowInputs.get(id)
  if (!el) return
  el.focus()
  el.select()
}

async function commitTitle(sub: { id: string, title: string }, input: HTMLInputElement): Promise<boolean> {
  const title = input.value.trim()
  if (!title) {
    input.value = sub.title
    return false
  }
  if (title === sub.title) return true
  try {
    await updateTask(sub.id, { title })
    return true
  } catch {
    input.value = sub.title
    toast.add({ title: 'Could not rename the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
    return false
  }
}

async function onRowBlur(sub: { id: string, title: string }, event: Event) {
  await commitTitle(sub, event.target as HTMLInputElement)
}

// Enter commits the rename and immediately opens a fresh row right after this
// one — the same "type, Enter, keep typing" flow as Asana's checklist, instead
// of today's Enter-just-blurs.
async function onRowEnter(sub: { id: string, title: string }, event: Event) {
  const input = event.target as HTMLInputElement
  if (!(await commitTitle(sub, input))) return
  if (!activeProject.value) return

  const before = subtasks.value
  const idx = before.findIndex(t => t.id === sub.id)
  const nextSiblingId = before[idx + 1]?.id ?? null

  let created
  try {
    created = await createSubtask(activeProject.value.id, props.parentTaskId, '')
  } catch {
    toast.add({ title: 'Could not add the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  // createSubtask always appends at the end; when the row we just edited was
  // not already last, slot the new one in right after it instead.
  if (nextSiblingId) {
    try {
      await moveSubtask(created.id, props.parentTaskId, sub.id, nextSiblingId)
    } catch { /* leave it at the end rather than fail the whole add */ }
  }
  await nextTick()
  focusRow(created.id)
}

function onRowEscape(sub: { title: string }, event: Event) {
  const input = event.target as HTMLInputElement
  input.value = sub.title
  input.blur()
}

// Tab indents a row under the sibling directly above it (its last child);
// Shift+Tab outdents it to become the next sibling of its current parent.
// Both are no-ops when there is nothing to nest under.
async function onRowTab(sub: { id: string }, event: KeyboardEvent) {
  if (event.shiftKey) {
    if (!grandparentId.value) return
    try {
      await moveSubtask(sub.id, grandparentId.value, props.parentTaskId, null)
    } catch {
      toast.add({ title: 'Could not outdent the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
    }
    return
  }

  const idx = subtasks.value.findIndex(t => t.id === sub.id)
  if (idx <= 0) return // nothing above to nest under
  const newParent = subtasks.value[idx - 1]!
  const lastChildId = subtasksOf(newParent.id).at(-1)?.id ?? null
  try {
    await moveSubtask(sub.id, newParent.id, lastChildId, null)
  } catch {
    toast.add({ title: 'Could not indent the subtask', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// ─── Drag reorder (siblings only — re-nesting is Tab/Shift+Tab, not drag) ──

const listEl = useTemplateRef<HTMLElement>('listEl')
let sortable: Sortable | null = null

function handleDrop(evt: Sortable.SortableEvent) {
  const itemEl = evt.item as HTMLElement
  const subId = itemEl.dataset.id
  if (!subId) return

  const children = [...evt.to.children] as HTMLElement[]
  const droppedAt = children.indexOf(itemEl)
  const beforeEl = children.slice(0, droppedAt).reverse().find(el => el.dataset.id)
  const afterEl = children.slice(droppedAt + 1).find(el => el.dataset.id)

  // Revert the DOM: Vue owns it, state is the single source of truth.
  evt.from.insertBefore(itemEl, evt.from.children[evt.oldIndex ?? 0] ?? null)

  moveSubtask(subId, props.parentTaskId, beforeEl?.dataset.id ?? null, afterEl?.dataset.id ?? null)
}

function destroySortable() {
  sortable?.destroy()
  sortable = null
}

// Keyed by the sibling set itself, not the subtask objects, so a drag in
// progress is not torn down by an edit landing mid-drag (autosave, an agent,
// a teammate).
const siblingSignature = computed(() => subtasks.value.map(t => `${t.id}:${t.position}`).join(','))

watch([siblingSignature, locked], async () => {
  await nextTick()
  destroySortable()
  if (locked.value || !listEl.value) return
  // Unique per parent so items can only be dragged among their own siblings —
  // re-nesting across levels is deliberately keyboard-only (Tab/Shift+Tab).
  sortable = Sortable.create(listEl.value, {
    group: `subtasks-${props.parentTaskId}`,
    draggable: '.kanban-subtask-row',
    handle: '.kanban-subtask-handle',
    animation: 150,
    ghostClass: 'kanban-ghost',
    onEnd: handleDrop
  })
}, { immediate: true })

onBeforeUnmount(destroySortable)
</script>

<template>
  <div>
    <ul
      ref="listEl"
      class="list-none"
    >
      <li
        v-for="sub in subtasks"
        :key="sub.id"
        :data-id="sub.id"
        class="kanban-subtask-row"
      >
        <div class="group/sub flex items-center gap-2 py-0.5">
          <UIcon
            v-if="!locked"
            name="i-lucide-grip-vertical"
            class="kanban-subtask-handle size-3.5 shrink-0 cursor-grab text-dimmed opacity-0 transition-opacity group-hover/sub:opacity-100"
          />
          <button
            type="button"
            class="shrink-0"
            :class="sub.completedAt != null ? 'text-success' : 'text-dimmed hover:text-success'"
            :disabled="locked"
            :aria-label="sub.completedAt != null ? 'Mark subtask as not done' : 'Mark subtask as done'"
            @click="toggleSubtask(sub)"
          >
            <UIcon
              :name="sub.completedAt != null ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-4"
            />
          </button>
          <input
            :ref="(el) => setInputRef(sub.id, el as Element | null)"
            :value="sub.title"
            :readonly="locked"
            class="min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none"
            :class="sub.completedAt != null ? 'text-muted line-through decoration-1' : 'text-default'"
            @keydown.enter.prevent="onRowEnter(sub, $event)"
            @keydown.esc.prevent="onRowEscape(sub, $event)"
            @keydown.tab.prevent="onRowTab(sub, $event)"
            @blur="onRowBlur(sub, $event)"
          >
          <UserAvatar
            v-if="personById(sub.assigneeId)"
            :user-id="personById(sub.assigneeId)!.id"
            :name="personById(sub.assigneeId)!.name"
            :email="personById(sub.assigneeId)!.email"
            :image="personById(sub.assigneeId)!.image"
            size="3xs"
          />
          <UDropdownMenu
            v-if="!locked"
            :items="[[{ label: 'Remove subtask', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeSubtask(sub.id) }]]"
            :content="{ align: 'end', collisionPadding: 12 }"
          >
            <UButton
              icon="i-lucide-more-horizontal"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Subtask options"
              class="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/sub:opacity-100"
            />
          </UDropdownMenu>
          <UButton
            v-if="!locked"
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Remove subtask"
            class="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/sub:opacity-100"
            @click="removeSubtask(sub.id)"
          />
        </div>
        <div
          v-if="subtasksOf(sub.id).length"
          class="pl-5"
        >
          <KanbanSubtaskList
            :parent-task-id="sub.id"
            :readonly="locked"
          />
        </div>
      </li>
    </ul>
    <form
      v-if="!locked"
      class="flex items-center gap-2 py-0.5 pl-[22px]"
      @submit.prevent="addSubtask"
    >
      <UIcon
        name="i-lucide-plus"
        class="size-4 shrink-0 text-dimmed"
      />
      <input
        ref="draftInput"
        v-model="draft"
        placeholder="Add a subtask…"
        aria-label="New subtask title"
        class="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-default outline-none placeholder:text-dimmed"
      >
      <UButton
        type="submit"
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        label="Add subtask"
        data-add-subtask
      />
    </form>
    <p
      v-else-if="lock.boardNote"
      class="py-0.5 pl-[22px] text-xs text-muted"
    >
      This board is read-only here: it belongs to the crew.
    </p>
  </div>
</template>
