<script setup lang="ts">
// A select whose open list follows the app's theme. The native select draws its open list in the browser's own
// colours, so an option could be unreadable in dark mode. This one renders through Nuxt UI, like the other selects.
interface SelectOption { label: string, value: string }

const props = withDefaults(defineProps<{
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}>(), {
  placeholder: undefined,
  disabled: false,
  size: 'md'
})

const model = defineModel<string>()
</script>

<template>
  <USelect
    v-model="model"
    :items="props.options"
    value-key="value"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :size="props.size"
  />
</template>
