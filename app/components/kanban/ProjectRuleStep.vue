<script setup lang="ts">
// One step of a rule (the trigger, a condition or an action): a kind, and the one
// value that kind needs. The builder says which kinds it offers and what to pick from.
import type { StepField } from '~/utils/ruleKinds'

const props = defineProps<{
  kinds: { value: string, label: string, field: StepField, disabled?: boolean }[]
  columns: { id: string, name: string }[]
  people: { id: string, name: string }[]
  labels: string[]
  // A team rule names its column in words instead of picking one board's column.
  columnAsText?: boolean
}>()

const row = defineModel<{ kind: string, value: string }>({ required: true })

const listId = useId()
const field = computed(() => props.kinds.find(k => k.value === row.value.kind)?.field ?? 'none')

function setKind(kind: string) {
  row.value = { kind, value: '' }
}

function setValue(value: string) {
  row.value = { ...row.value, value }
}

// The pickers hand over strings. An item cannot have an empty value, so "Nobody" and "Anyone" use a sentinel that
// stands for the empty value the rule stores.
const NONE = '__none__'
const kindOptions = computed(() => props.kinds.map(kind => ({ label: kind.label, value: kind.value, disabled: kind.disabled })))
const columnOptions = computed(() => props.columns.map(column => ({ label: column.name, value: column.id })))
const personOptions = computed(() => {
  const leading = field.value === 'personOrNobody'
    ? [{ label: 'Nobody', value: NONE }]
    : field.value === 'personOrAnyone' ? [{ label: 'Anyone', value: NONE }] : []
  return [...leading, ...props.people.map(person => ({ label: person.name, value: person.id }))]
})
const personPicked = computed(() => row.value.value || (field.value === 'person' ? null : NONE))
const VISIBILITY_OPTIONS = [{ label: 'Team only', value: 'internal' }, { label: 'Shared with customer', value: 'customer' }]
const YES_NO_OPTIONS = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]
function setPicked(value: string | null | undefined) {
  setValue(value ?? '')
}
function setPerson(value: string | null | undefined) {
  setValue(!value || value === NONE ? '' : value)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <AppSelect
      :model-value="row.kind"
      :options="kindOptions"
      class="max-w-full"
      data-step-kind
      @update:model-value="(value) => setKind(value ?? '')"
    />

    <input
      v-if="field === 'column' && columnAsText"
      :value="row.value"
      type="text"
      maxlength="40"
      placeholder="Column name"
      class="w-44 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
      data-step-value
      @input="setValue(($event.target as HTMLInputElement).value)"
    >

    <AppSelect
      v-else-if="field === 'column'"
      :model-value="row.value || null"
      :options="columnOptions"
      placeholder="Pick a column"
      class="min-w-0"
      data-step-value
      @update:model-value="setPicked"
    />

    <AppSelect
      v-else-if="field === 'person' || field === 'personOrNobody' || field === 'personOrAnyone'"
      :model-value="personPicked"
      :options="personOptions"
      placeholder="Pick someone"
      class="min-w-0"
      data-step-value
      @update:model-value="setPerson"
    />

    <template v-else-if="field === 'label'">
      <input
        :value="row.value"
        type="text"
        maxlength="50"
        placeholder="Label"
        :list="listId"
        class="w-40 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
        data-step-value
        @input="setValue(($event.target as HTMLInputElement).value)"
      >
      <datalist :id="listId">
        <option
          v-for="label in labels"
          :key="label"
          :value="label"
        />
      </datalist>
    </template>

    <input
      v-else-if="field === 'days'"
      :value="row.value"
      type="number"
      min="0"
      max="365"
      placeholder="Days"
      class="w-24 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
      data-step-value
      @input="setValue(($event.target as HTMLInputElement).value)"
    >

    <input
      v-else-if="field === 'text'"
      :value="row.value"
      type="text"
      maxlength="2000"
      placeholder="Text"
      class="min-w-0 flex-1 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
      data-step-value
      @input="setValue(($event.target as HTMLInputElement).value)"
    >

    <AppSelect
      v-else-if="field === 'visibility'"
      :model-value="row.value || null"
      :options="VISIBILITY_OPTIONS"
      placeholder="Pick one"
      data-step-value
      @update:model-value="setPicked"
    />

    <AppSelect
      v-else-if="field === 'yesNo'"
      :model-value="row.value || null"
      :options="YES_NO_OPTIONS"
      placeholder="Pick one"
      data-step-value
      @update:model-value="setPicked"
    />
  </div>
</template>
