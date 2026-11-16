<script setup lang="ts">
// One version of the legal notice, as it was in force. Public: no sign-in.
definePageMeta({ middleware: [] })
const route = useRoute()
const version = computed(() => String(route.params.version ?? ''))
</script>

<template>
  <LegalDocumentPage
    name="imprint"
    :version="version"
  />
</template>
