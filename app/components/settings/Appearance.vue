<script setup lang="ts">
import { colorHex } from '#shared/utils/colors'

// Appearance: the accent and neutral colours. The colour mode is set in one place: the account menu's Appearance row.
const { primaryColor, neutralColor, PRIMARY_COLORS, NEUTRAL_COLORS, setPrimaryColor, setNeutralColor } = useUserSettings()

function swatchStyle(color: string, selected: boolean) {
  return {
    backgroundColor: colorHex(color),
    ...(selected
      ? {
          transform: 'scale(1.15)',
          outline: `3px solid ${colorHex(color)}`,
          outlineOffset: '2px'
        }
      : {})
  }
}
</script>

<template>
  <div
    id="appearance"
    class="rounded-xl border border-default bg-default overflow-hidden"
  >
    <div class="px-5 py-3 border-b border-default bg-elevated/40">
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">Appearance</span>
    </div>

    <!-- The colour mode is set in one place: the account menu's Appearance row (AppSidebar.vue). -->
    <div class="divide-y divide-default">
      <!-- Primary color -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-palette"
              class="size-4 text-default"
            />
          </div>
          <div>
            <p class="text-sm font-medium">
              Accent color
            </p>
            <p class="text-xs text-muted mt-0.5">
              Buttons, highlights and interactive elements
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 pl-12">
          <div
            v-for="color in PRIMARY_COLORS"
            :key="color"
            class="flex flex-col items-center gap-1"
          >
            <button
              :title="color"
              :aria-label="`Accent ${color}`"
              :aria-pressed="primaryColor === color"
              class="size-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              :style="swatchStyle(color, primaryColor === color)"
              @click="setPrimaryColor(color as any)"
            >
              <UIcon
                v-if="primaryColor === color"
                name="i-lucide-check"
                class="size-3.5 text-white mx-auto drop-shadow"
              />
            </button>
            <span class="text-xs text-muted capitalize">{{ color }}</span>
          </div>
        </div>
      </div>

      <!-- Neutral color -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-circle-half-stroke"
              class="size-4 text-default"
            />
          </div>
          <div>
            <p class="text-sm font-medium">
              Neutral color
            </p>
            <p class="text-xs text-muted mt-0.5">
              Backgrounds, borders and text
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 pl-12">
          <div
            v-for="color in NEUTRAL_COLORS"
            :key="color"
            class="flex flex-col items-center gap-1"
          >
            <button
              :title="color"
              :aria-label="`Neutral ${color}`"
              :aria-pressed="neutralColor === color"
              class="size-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              :style="swatchStyle(color, neutralColor === color)"
              @click="setNeutralColor(color as any)"
            >
              <UIcon
                v-if="neutralColor === color"
                name="i-lucide-check"
                class="size-3.5 text-white mx-auto drop-shadow"
              />
            </button>
            <span class="text-xs text-muted capitalize">{{ color }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
