<script setup>
useHead({
  htmlAttrs: { lang: 'en' },
  // viewport-fit=cover lets the page reach the phone's edges, so env(safe-area-inset-*) is not 0 on a notched phone:
  // the tab bar and the content keep clear of the home indicator. Without it every inset reads 0.
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }
  ],
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
