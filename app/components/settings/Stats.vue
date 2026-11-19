<script setup lang="ts">
import { inject } from 'vue'
import { AI_SETTINGS_KEY } from '~/composables/useAiSettings'
import { formatMoney } from '~/utils/aiSettingsFormat'

// Your stats: the AI prompts you sent and what they cost. The totals come from the page's AI state (provided once).
const { totalPrompts, totalAiCost } = inject(AI_SETTINGS_KEY)!
</script>

<template>
  <div
    id="stats"
    class="rounded-xl border border-default bg-default overflow-hidden"
  >
    <div class="px-5 py-3 border-b border-default bg-elevated/40">
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">Your stats</span>
    </div>
    <div class="grid grid-cols-2 divide-x divide-default">
      <div class="p-5 flex items-center gap-3">
        <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-sparkles"
            class="size-4 text-primary"
          />
        </div>
        <div>
          <p class="text-xl font-bold tabular-nums leading-none">
            {{ totalPrompts }}
          </p>
          <p class="text-xs text-muted mt-1">
            {{ totalPrompts === 1 ? 'AI prompt' : 'AI prompts' }}
          </p>
        </div>
      </div>
      <div class="p-5 flex items-center gap-3">
        <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-wallet-cards"
            class="size-4 text-primary"
          />
        </div>
        <div>
          <p class="text-xl font-bold tabular-nums leading-none">
            {{ formatMoney(totalAiCost) }}
          </p>
          <p class="text-xs text-muted mt-1">
            AI spent
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
