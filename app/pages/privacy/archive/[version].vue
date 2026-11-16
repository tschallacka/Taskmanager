<script setup lang="ts">
// One version of the privacy policy, as it was in force. Public: no sign-in.
definePageMeta({ middleware: [] })
const route = useRoute()
const version = computed(() => String(route.params.version ?? ''))
</script>

<template>
  <LegalDocumentPage
    name="privacy"
    :version="version"
  />
</template>
