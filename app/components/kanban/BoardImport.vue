<script setup lang="ts">
// "Import a backup" on Board settings: pick a backup file, see the dry-run report, then confirm. Nothing is
// written until the second step. Only the instance admin and the owners and admins of the board's team see
// this work: the server refuses everyone else with a plain sentence, which is shown here.
const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ imported: [] }>()

interface Report {
  dryRun: boolean
  source: { instance: string, boardName: string, exportedAt: string }
  created: Record<string, number>
  skippedCount: number
  createdColumns: { name: string }[]
  matchedColumns: { backup: string, target: string }[]
  unmappedPeople: { name: string, asAuthor: number, asAssignee: number }[]
  warnings: string[]
  attachmentsListed: number
}

const file = ref<File | null>(null)
const body = ref('')
const report = ref<Report | null>(null)
const busy = ref(false)
const error = ref('')
const done = ref('')

const LABELS: Record<string, string> = {
  tasks: 'cards', updates: 'updates', activity: 'activity lines', timeEntries: 'time entries',
  statusUpdates: 'status updates', messages: 'messages', rules: 'rules (switched off)', columns: 'columns', fields: 'custom fields'
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] ?? null
  file.value = picked
  report.value = null
  done.value = ''
  error.value = ''
  body.value = picked ? await picked.text() : ''
  if (picked) await check()
}

function refusal(e: unknown): string {
  const data = (e as { data?: { message?: unknown, data?: { problems?: unknown } } })?.data
  const problems = Array.isArray(data?.data?.problems) ? data!.data!.problems as string[] : []
  const message = typeof data?.message === 'string' ? data.message : 'The backup could not be imported.'
  return problems.length ? `${message} ${problems.slice(0, 5).join(' ')}` : message
}

async function send(dryRun: boolean): Promise<Report | null> {
  return await $fetch<Report>(`/api/projects/${props.projectId}/import`, {
    method: 'POST',
    query: dryRun ? { dryRun: 1 } : {},
    headers: { 'content-type': 'application/json' },
    body: body.value
  })
}

async function check() {
  busy.value = true
  error.value = ''
  try {
    report.value = await send(true)
  } catch (e) {
    error.value = refusal(e)
    report.value = null
  } finally {
    busy.value = false
  }
}

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const written = await send(false)
    done.value = `Imported. ${written?.created.tasks ?? 0} cards, ${written?.skippedCount ?? 0} rows already here were skipped.`
    report.value = null
    file.value = null
    body.value = ''
    emit('imported')
  } catch (e) {
    error.value = refusal(e)
  } finally {
    busy.value = false
  }
}

function cancel() {
  report.value = null
  file.value = null
  body.value = ''
  error.value = ''
}
</script>

<template>
  <!-- break-words: a name or address with no spaces (an email, a long file name) wraps instead of running past the phone edge. -->
  <div class="min-w-0 break-words">
    <h3 class="text-sm font-semibold text-default">
      Import a backup
    </h3>
    <p class="mt-1 text-xs text-muted">
      Loads a backup file (made by Download backup) into this board. The cards keep their dates and their authors,
      where the author is a member of this team. An author who is not, becomes you, and keeps the name they had as
      "imported". Cards, comments, subtasks, blockers, labels, custom fields, time logs, status updates and messages
      come across. Rules come in switched off. Attachment files do not come across yet. A card that is already here
      from the same backup is skipped, so running it twice adds nothing. Only team owners and admins can import.
    </p>

    <label class="mt-3 inline-block cursor-pointer rounded-lg border border-default px-3 py-1.5 text-xs text-default transition-colors hover:bg-elevated">
      Choose a backup file
      <input
        type="file"
        accept="application/json,.json"
        class="sr-only"
        data-import-file
        @change="onFile"
      >
    </label>
    <span
      v-if="file"
      class="ml-2 break-all text-xs text-muted"
    >{{ file.name }}</span>

    <p
      v-if="busy"
      class="mt-3 text-xs text-muted"
    >
      Checking…
    </p>
    <p
      v-if="error"
      class="mt-3 text-xs text-red-500"
      data-import-error
    >
      {{ error }}
    </p>
    <p
      v-if="done"
      class="mt-3 text-xs text-default"
      data-import-done
    >
      {{ done }}
    </p>

    <div
      v-if="report"
      class="mt-4 rounded-lg border border-default p-3 text-xs text-default"
      data-import-report
    >
      <p class="font-medium">
        Check first: nothing has been written yet.
      </p>
      <p class="mt-1 text-muted">
        From {{ report.source.boardName }}, exported {{ new Date(report.source.exportedAt).toLocaleString() }}.
      </p>
      <ul class="mt-2 space-y-0.5">
        <li
          v-for="(label, key) in LABELS"
          :key="key"
        >
          {{ report.created[key] ?? 0 }} {{ label }} to add
        </li>
        <li>{{ report.skippedCount }} already here, skipped</li>
        <li v-if="report.attachmentsListed">
          {{ report.attachmentsListed }} attachment files listed, not imported
        </li>
      </ul>
      <p
        v-if="report.createdColumns.length"
        class="mt-2"
      >
        New columns: {{ report.createdColumns.map(c => c.name).join(', ') }}
      </p>
      <div
        v-if="report.unmappedPeople.length"
        class="mt-2"
      >
        <p>Not matched to a member, so they become you (or stay unassigned):</p>
        <ul class="ml-4 list-disc">
          <li
            v-for="person in report.unmappedPeople"
            :key="person.name"
          >
            {{ person.name }}: {{ person.asAuthor }} updates or changes, {{ person.asAssignee }} assignments
          </li>
        </ul>
      </div>
      <div
        v-if="report.warnings.length"
        class="mt-2"
      >
        <p>Warnings:</p>
        <ul class="ml-4 list-disc">
          <li
            v-for="(warning, at) in report.warnings.slice(0, 10)"
            :key="at"
          >
            {{ warning }}
          </li>
        </ul>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
          :disabled="busy"
          data-import-confirm
          @click="confirm"
        >
          Import these cards
        </button>
        <button
          type="button"
          class="rounded-lg border border-default px-3 py-1.5 text-xs text-default hover:bg-elevated"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
