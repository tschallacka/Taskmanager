<script setup lang="ts">
// A select whose open list follows the app's theme. The native select draws its open list in the browser's own
// colours, so an option could be unreadable in dark mode. This one renders through Nuxt UI, like the other selects.
interface SelectOption { label: string, value: string, disabled?: boolean }

const props = withDefaults(defineProps<{
  options?: SelectOption[]
  // Options under headings, one heading per group (as the native optgroup was). Give either options or groups.
  groups?: { label: string, options: SelectOption[] }[]
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}>(), {
  options: () => [],
  groups: undefined,
  placeholder: undefined,
  disabled: false,
  size: 'md'
})

const model = defineModel<string | null>()
// A disabled option stays in the list, greyed out, as it did in the native select.
function toItem(option: SelectOption) {
  return { label: option.label, value: option.value, disabled: option.disabled }
}
// Nuxt UI draws an array of arrays as groups, and a label item as the heading of its group.
interface PickerItem { label: string, value?: string, type?: 'label', disabled?: boolean }
const items = computed<PickerItem[] | PickerItem[][]>(() => props.groups
  ? props.groups.map((group): PickerItem[] => [{ label: group.label, type: 'label' }, ...group.options.map(toItem)])
  : props.options.map(toItem))
</script>

<template>
  <USelect
    :model-value="model ?? undefined"
    :items="items"
    value-key="value"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :size="props.size"
    :ui="{ base: 'min-h-11 sm:min-h-0 min-w-0 max-w-full', value: 'min-w-0 truncate', content: 'z-[80] min-w-fit max-w-[calc(100vw-2rem)]', item: 'whitespace-normal break-words max-w-[calc(100vw-4rem)]', itemLabel: 'whitespace-normal break-words' }"
    @update:model-value="model = $event ?? null"
  />
</template>
