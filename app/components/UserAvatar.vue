<script setup lang="ts">
// One avatar for every place a person shows: their picture when they have one, otherwise their initials on a colour
// picked from their id (app/utils/avatarInitials.ts), so it looks the same everywhere and on every visit.
import { colourFor, initialsOf, textOn } from '~/utils/avatarInitials'

const props = withDefaults(defineProps<{
  userId: string
  name?: string | null
  email?: string | null
  image?: string | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}>(), { size: 'xs' })

const initials = computed(() => initialsOf(props.name, props.email))
const background = computed(() => colourFor(props.userId))
const foreground = computed(() => textOn(background.value))
const label = computed(() => props.name || props.email || '')

// Pixels per size step, for the initials disc; a picture uses the same size through the avatar component.
const PX: Record<string, number> = { '3xs': 12, '2xs': 16, 'xs': 24, 'sm': 32, 'md': 40, 'lg': 48, 'xl': 64, '2xl': 96, '3xl': 128 }
const diameter = computed(() => PX[props.size] ?? 24)
</script>

<template>
  <UAvatar
    v-if="image"
    :src="image"
    :alt="label"
    :size="size"
    data-user-avatar="picture"
  />
  <span
    v-else
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none"
    :style="{ width: `${diameter}px`, height: `${diameter}px`, background, color: foreground, fontSize: `${Math.round(diameter * 0.4)}px` }"
    role="img"
    :aria-label="label || 'Person'"
    :title="label"
    data-user-avatar="initials"
  >{{ initials }}</span>
</template>
