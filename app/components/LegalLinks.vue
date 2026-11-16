<script setup lang="ts">
import { legalLinksToShow } from '#shared/utils/legalLinks'

// The Privacy and Imprint links at the foot of the sign-in, invitation and settings pages. A link shows only when its
// page is published: a draft's page is 404 (see shared/utils/legalLinks.ts). Public pages: no sign-in.
const { published } = useLegalPublished()
const links = computed(() => legalLinksToShow(published.value))
</script>

<template>
  <nav
    v-if="links.length"
    aria-label="Legal"
    class="flex justify-center gap-3 text-xs text-muted"
  >
    <template
      v-for="(link, index) in links"
      :key="link.name"
    >
      <span
        v-if="index"
        aria-hidden="true"
      >·</span>
      <NuxtLink
        :to="link.to"
        class="hover:underline"
      >{{ link.label }}</NuxtLink>
    </template>
  </nav>
</template>
