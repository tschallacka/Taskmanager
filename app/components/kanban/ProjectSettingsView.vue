<script setup lang="ts">
// Project settings, for the team only: the page keeps its tab away from a
// customer's contact. The section is kept in the URL so a reload stays on it.
import type { FieldType } from '~/composables/useCustomFields'
import { builtProjectSections, type ProjectSettingsKey } from '~/utils/projectSettingsSections'

const props = defineProps<{ projectId: string }>()

const route = useRoute()

// The view's own keys for ?section=: the GitHub section is still 'repositories' in the URL the redirect writes.
const VIEW_SECTIONS = ['general', 'repositories', 'rules', 'members', 'customers', 'secrets', 'fields', 'import', 'trash', 'archive'] as const

const section = computed(() => VIEW_SECTIONS.find(s => s === route.query.section) ?? 'general')
// The key the left list marks as current, from the section table.
const currentKey = computed<ProjectSettingsKey>(() => (section.value === 'repositories' ? 'github' : section.value))
const sectionLabel = computed(() => builtProjectSections().find(s => s.key === currentKey.value)?.label ?? 'General')

// ─── Custom fields ─────────────────────────────────────────

const { fields, templates, loadTemplates, addField, removeField, messageOf } = useCustomFields(() => props.projectId)

watch(() => props.projectId, () => {
  loadTemplates().catch(() => {})
}, { immediate: true })

const FIELD_TYPE_LABELS: Record<FieldType, string> = { text: 'Text', number: 'Number', select: 'Dropdown', date: 'Date' }
const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: 'i-lucide-type', number: 'i-lucide-hash', select: 'i-lucide-list', date: 'i-lucide-calendar'
}

const newField = reactive({ name: '', type: 'text' as FieldType, options: '' })
const fieldError = ref('')
// Deleting a field takes every task's value with it, so it asks twice.
const confirmingRemove = ref<string | null>(null)

async function runFieldAction(action: () => Promise<unknown>) {
  fieldError.value = ''
  try {
    await action()
  } catch (e) {
    fieldError.value = messageOf(e, 'Could not change the fields')
  }
}

function addTemplate(key: string) {
  return runFieldAction(() => addField({ template: key }))
}

function createField() {
  const name = newField.name.trim()
  if (!name) return
  const options = newField.type === 'select'
    ? newField.options.split(',').map(option => option.trim()).filter(Boolean)
    : undefined
  // The form empties at once, so what is typed while the request is out is not
  // wiped when it lands; a refusal puts the draft back.
  const draft = { name: newField.name, options: newField.options }
  newField.name = ''
  newField.options = ''
  return runFieldAction(async () => {
    try {
      await addField({ name, type: newField.type, options })
    } catch (e) {
      if (!newField.name) {
        newField.name = draft.name
        newField.options = draft.options
      }
      throw e
    }
  })
}

function dropField(fieldId: string) {
  if (confirmingRemove.value !== fieldId) {
    confirmingRemove.value = fieldId
    return
  }
  confirmingRemove.value = null
  return runFieldAction(() => removeField(fieldId))
}
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
    <SettingsProjectShell
      :project-id="projectId"
      :current="currentKey"
    >
      <h2 class="text-lg font-semibold text-default">
        {{ sectionLabel }}
      </h2>

      <ProjectSettingsProjectGeneralSettings
        v-if="section === 'general'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectGithubSettings
        v-else-if="section === 'repositories'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectRulesSettings
        v-else-if="section === 'rules'"
        :project-id="projectId"
        class="mt-4"
      />
      <ProjectSettingsProjectMembersSettings
        v-else-if="section === 'members'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectSecretsSettings
        v-else-if="section === 'secrets'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectImportSettings
        v-else-if="section === 'import'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectTrashSettings
        v-else-if="section === 'trash'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectArchiveSettings
        v-else-if="section === 'archive'"
        class="mt-4"
        :project-id="projectId"
      />
      <ProjectSettingsProjectCustomerSettings
        v-else-if="section === 'customers'"
        class="mt-4"
        :project-id="projectId"
      />
      <section
        v-else-if="section === 'fields'"
        class="mt-4"
        data-custom-fields
      >
        <p class="text-xs text-muted">
          Extra columns for every task, such as a priority or an estimate.
        </p>

        <ul
          v-if="fields.length"
          class="mt-3 divide-y divide-default rounded-xl border border-default bg-default text-sm"
        >
          <li
            v-for="field in fields"
            :key="field.id"
            class="flex items-center gap-2 px-3 py-2"
            data-field-row
          >
            <UIcon
              :name="FIELD_TYPE_ICONS[field.type]"
              class="size-4 shrink-0 text-dimmed"
            />
            <span class="min-w-0 flex-1 truncate text-default">{{ field.name }}</span>
            <span class="shrink-0 text-xs text-dimmed">{{ FIELD_TYPE_LABELS[field.type] }}</span>
            <button
              class="shrink-0 text-xs transition-colors"
              :class="confirmingRemove === field.id ? 'font-medium text-error' : 'text-dimmed hover:text-error'"
              :aria-label="`Delete ${field.name}`"
              data-field-delete
              @click="dropField(field.id)"
            >
              <template v-if="confirmingRemove === field.id">
                Delete?
              </template>
              <UIcon
                v-else
                name="i-lucide-trash-2"
                class="size-3.5"
              />
            </button>
          </li>
        </ul>

        <div
          v-if="templates.length"
          class="mt-3 flex flex-wrap gap-2"
        >
          <button
            v-for="template in templates"
            :key="template.key"
            class="flex items-center gap-1.5 rounded-lg border border-dashed border-default px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-elevated hover:text-default"
            :data-field-template="template.key"
            @click="addTemplate(template.key)"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5"
            />
            {{ template.name }}
          </button>
        </div>

        <form
          class="mt-3 space-y-2 rounded-xl border border-default bg-default p-3"
          @submit.prevent="createField"
        >
          <input
            v-model="newField.name"
            type="text"
            maxlength="40"
            placeholder="New field name"
            class="w-full rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none placeholder:text-dimmed focus:border-primary"
            data-new-field-name
          >
          <div class="flex gap-2">
            <select
              v-model="newField.type"
              class="flex-1 rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
              data-new-field-type
            >
              <option
                v-for="(label, type) in FIELD_TYPE_LABELS"
                :key="type"
                :value="type"
              >
                {{ label }}
              </option>
            </select>
            <UButton
              type="submit"
              label="Add"
              size="sm"
              :disabled="!newField.name.trim()"
              data-new-field-add
            />
          </div>
          <input
            v-if="newField.type === 'select'"
            v-model="newField.options"
            type="text"
            placeholder="Options, comma separated"
            class="w-full rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none placeholder:text-dimmed focus:border-primary"
            data-new-field-options
          >
        </form>
        <p
          v-if="fieldError"
          class="mt-2 text-xs text-error"
          data-field-error
        >
          {{ fieldError }}
        </p>
      </section>
    </SettingsProjectShell>
  </div>
</template>
