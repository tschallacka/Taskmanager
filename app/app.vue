<script setup>
useHead({
  htmlAttrs: { lang: 'en' },
  titleTemplate: title => title ? `${title} — Taskmanager` : 'Taskmanager',
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
    { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' }
  ]
})
useSeoMeta({
  ogSiteName: 'Taskmanager',
  twitterCard: 'summary'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
