<script setup lang="ts">
import { errorMessage } from '~/utils/untypedFetch'

// A task's custom fields, laid out like the dates above it in the panel.
const props = defineProps<{ taskId: string }>()

const toast = useToast()
const { activeProjectId } = useProjects()
const { fields, valueOf, setValues } = useCustomFields(activeProjectId)

async function change(fieldId: string, value: string | null) {
  try {
    await setValues(props.taskId, { [fieldId]: value })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the field'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <!-- Contents of the panel's property grid: each field is one label and value pair. -->
  <div
    v-if="fields.length"
    class="contents"
    data-task-fields
  >
    <div
      v-for="field in fields"
      :key="field.id"
      class="grid grid-cols-[6rem_1fr] items-center gap-x-3 max-md:grid-cols-[6rem_1fr_1rem] max-md:after:content-['›'] max-md:after:text-lg max-md:after:leading-none max-md:after:text-dimmed"
    >
      <dt class="truncate text-muted">
        {{ field.name }}
      </dt>
      <dd class="min-w-0">
        <KanbanFieldInput
          :field="field"
          :value="valueOf(taskId, field.id)"
          @change="change(field.id, $event)"
        />
      </dd>
    </div>
  </div>
</template>
