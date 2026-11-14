<script setup lang="ts">
import { computed, watch } from 'vue'
import { cardIdHref, cardIdsIn, splitCardIds } from '~/utils/cardIdLinks'
import { openableCard, requestOpenableCards } from '~/composables/useOpenableCards'

// Plain text with the card ids in it as links. A card the reader may open links to its path, with its title as the tooltip;
// any other id stays plain text. The inner link does not open the row it sits in (an inbox item).
const props = defineProps<{ text: string }>()

watch(() => props.text, text => requestOpenableCards(cardIdsIn(text)), { immediate: true })

type Piece = { text: string } | { id: string, projectId: string, title: string }

const pieces = computed<Piece[]>(() => splitCardIds(props.text, id => openableCard(id) !== null).map((piece): Piece => {
  if (!('id' in piece)) return piece
  const card = openableCard(piece.id)
  return card ? { id: piece.id, ...card } : { text: piece.id }
}))
</script>

<template>
  <span>
    <template
      v-for="(piece, index) in pieces"
      :key="index"
    >
      <NuxtLink
        v-if="'id' in piece"
        :to="cardIdHref(piece.projectId, piece.id)"
        :title="piece.title"
        class="text-primary underline-offset-2 hover:underline"
        data-card-id-link
        @click.stop
      >{{ piece.id }}</NuxtLink>
      <template v-else>
        {{ piece.text }}
      </template>
    </template>
  </span>
</template>
