<script setup lang="ts">
// The Privacy and Imprint links, shown at the foot of the sign-in, invitation and settings pages. Public pages: no sign-in.
</script>

<template>
  <nav
    aria-label="Legal"
    class="flex justify-center gap-3 text-xs text-muted"
  >
    <NuxtLink
      to="/privacy"
      class="hover:underline"
    >Privacy</NuxtLink>
    <span aria-hidden="true">·</span>
    <NuxtLink
      to="/imprint"
      class="hover:underline"
    >Imprint</NuxtLink>
  </nav>
</template>
