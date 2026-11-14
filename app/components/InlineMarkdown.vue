<script setup lang="ts">
import { computed, watch } from 'vue'
import { renderCommentMarkdown } from '~/utils/markdown'
import { cardIdsIn, linkCardIdsInHtml } from '~/utils/cardIdLinks'
import { openableCard, requestOpenableCards } from '~/composables/useOpenableCards'

// Renders a task comment: the Markdown it is stored as, drawn like a task description.
// GFM with breaks: true (a line break stays a line break, as it always did), then the
// chat sanitiser: fences, lists and headings draw; script stays inert.
// Bodies from agents over MCP are untrusted, so this is the chat sanitiser, not raw HTML.
const props = defineProps<{ text: string }>()

// Card ids in the text become links to the cards the reader may open (the answer arrives after the first draw, and the
// text redraws then).
watch(() => props.text, text => requestOpenableCards(cardIdsIn(text)), { immediate: true })

const html = computed(() => linkCardIdsInHtml(renderCommentMarkdown(props.text), openableCard))
</script>

<template>
  <div
    class="markdown-content comment-body w-full min-w-0 break-words"
    v-html="html"
  />
</template>
