<script setup lang="ts">
// A small "?" that explains the thing next to it in a sentence or two and, when the person may read it,
// links to the help page that goes deeper. Put it beside a label or a heading:
//   <HelpHint page="crews/give-a-board-a-crew">A crew works on a board of its own…</HelpHint>
// The link is left out when that page is not one this person may open, because help follows what they
// may do: a hint inside a screen they can use normally matches a page they can read.
const props = defineProps<{
  /** The slug of the page under docs/, e.g. `crews/give-a-board-a-crew`. */
  page?: string
  label?: string
}>()

const { load, has } = useHelpIndex()
onMounted(load)

const open = ref(false)
const linked = computed(() => Boolean(props.page && has(props.page)))
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'start' }"
  >
    <button
      type="button"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-default focus-visible:outline-2 focus-visible:outline-primary"
      :aria-label="label ?? 'What is this?'"
      data-help-hint
    >
      <UIcon
        name="i-lucide-circle-help"
        class="size-4"
      />
    </button>
    <template #content>
      <div class="max-w-xs space-y-2 p-3 text-xs leading-relaxed text-default">
        <p><slot /></p>
        <NuxtLink
          v-if="linked"
          :to="`/help/${page}`"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          data-help-hint-link
          @click="open = false"
        >
          Read more
          <UIcon
            name="i-lucide-arrow-right"
            class="size-3"
          />
        </NuxtLink>
      </div>
    </template>
  </UPopover>
</template>
