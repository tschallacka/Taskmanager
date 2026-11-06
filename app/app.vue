<script setup>
// The instance's name and icon (the instance admin sets them under Branding). Until they load, and when none
// is set, the built-in name and icons are used.
const { data: branding } = useFetch<{ name: string, hasIcon: boolean }>('/api/branding', { key: 'instance-branding', server: false })
const instanceName = computed(() => branding.value?.name || 'Taskmanager')
const iconHref = computed(() => branding.value?.hasIcon ? '/api/branding/icon' : null)

useHead({
  htmlAttrs: { lang: 'en' },
  titleTemplate: title => title ? `${title} — ${instanceName.value}` : instanceName.value,
  link: computed(() => [
    { rel: 'icon', href: iconHref.value ?? '/favicon.ico', sizes: 'any' },
    { rel: 'apple-touch-icon', href: iconHref.value ?? '/apple-touch-icon-180x180.png' },
    { rel: 'manifest', href: '/api/branding/manifest' }
  ])
})
useSeoMeta({
  ogSiteName: instanceName,
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
