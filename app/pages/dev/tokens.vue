<script setup lang="ts">
// Dev only: every design token and the shared control styles on one page, so the
// later redesign cards can check their screens against it. In a production build
// the route answers 404.
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

useHead({ title: 'Design tokens (dev)' })

const roles = [
  { name: '--tm-canvas', label: 'Canvas' },
  { name: '--tm-surface', label: 'Surface' },
  { name: '--tm-raised', label: 'Raised' },
  { name: '--tm-hover', label: 'Hover' },
  { name: '--tm-hairline', label: 'Hairline' },
  { name: '--tm-hairline-strong', label: 'Hairline strong' },
  { name: '--tm-text', label: 'Text' },
  { name: '--tm-text-secondary', label: 'Text secondary' },
  { name: '--tm-text-muted', label: 'Text muted' },
  { name: '--tm-text-dimmed', label: 'Text dimmed' },
  { name: '--tm-accent', label: 'Accent' },
  { name: '--tm-accent-soft', label: 'Accent soft' },
  { name: '--tm-focus', label: 'Focus ring' }
]

const types = [
  { label: 'Greeting', cls: 'text-[length:var(--tm-font-size-greeting)] leading-[var(--tm-line-greeting)] font-semibold', sample: 'Good morning, Michael' },
  { label: 'Page title', cls: 'text-[length:var(--tm-font-size-page)] leading-[var(--tm-line-page)] font-semibold', sample: 'Design sample' },
  { label: 'Panel title', cls: 'text-[length:var(--tm-font-size-title)] leading-[var(--tm-line-title)] font-semibold', sample: 'Fix checkout tax rounding' },
  { label: 'Section', cls: 'text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold', sample: 'Getting started' },
  { label: 'Column', cls: 'text-[length:var(--tm-font-size-column)] leading-[var(--tm-line-column)] font-semibold', sample: 'To do' },
  { label: 'Card title', cls: 'text-[length:var(--tm-font-size-card-title)] leading-[var(--tm-line-card-title)] font-medium', sample: 'Review invoice template wording' },
  { label: 'Body', cls: 'text-[length:var(--tm-font-size-body)] leading-[var(--tm-line-body)]', sample: 'Customers in Germany see the VAT line rounded differently.' },
  { label: 'Label', cls: 'text-[length:var(--tm-font-size-label)] leading-[var(--tm-line-label)] font-medium', sample: 'billing · 6 Nov' },
  { label: 'Caption', cls: 'text-[length:var(--tm-font-size-caption)] leading-[var(--tm-line-caption)] font-semibold uppercase tracking-[0.06em]', sample: 'Projects' }
]

const spaces = [
  { name: '--tm-space-1', px: 4 },
  { name: '--tm-space-2', px: 8 },
  { name: '--tm-space-2h', px: 10 },
  { name: '--tm-space-3', px: 12 },
  { name: '--tm-space-3h', px: 14 },
  { name: '--tm-space-4', px: 16 },
  { name: '--tm-space-5', px: 24 },
  { name: '--tm-space-6', px: 32 }
]

const radii = [
  { name: '--tm-radius-sm', label: 'Button' },
  { name: '--tm-radius-md', label: 'Input' },
  { name: '--tm-radius-lg', label: 'Card' },
  { name: '--tm-radius-xl', label: 'Column' },
  { name: '--tm-radius-pill', label: 'Chip' }
]

// The eight states, each with its tone, a word and an icon. Colour is never alone.
const states = [
  { name: 'On track', tone: 'ok', icon: 'i-lucide-circle-check' },
  { name: 'At risk', tone: 'warn', icon: 'i-lucide-triangle-alert' },
  { name: 'Off track', tone: 'danger', icon: 'i-lucide-circle-x' },
  { name: 'Overdue · 6 Nov', tone: 'danger', icon: 'i-lucide-calendar-x' },
  { name: 'Due soon', tone: 'warn', icon: 'i-lucide-clock' },
  { name: 'Waits for 1', tone: 'warn', icon: 'i-lucide-hourglass' },
  { name: 'Shared with customer', tone: 'info', icon: 'i-lucide-share-2' },
  { name: 'Team only', tone: 'team', icon: 'i-lucide-lock' }
]
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 md:px-6">
    <header class="flex flex-col gap-1">
      <p class="text-[length:var(--tm-font-size-caption)] font-semibold uppercase tracking-[0.06em] text-(--tm-text-muted)">
        Dev only
      </p>
      <h1 class="text-[length:var(--tm-font-size-title)] leading-[var(--tm-line-title)] font-semibold text-(--tm-text)">
        Design tokens
      </h1>
      <p class="text-[length:var(--tm-font-size-body)] leading-[var(--tm-line-body)] text-(--tm-text-secondary)">
        Every token from app/assets/css/tokens.css, and the shared control styles. Switch the colour mode in Settings to see the light palette.
      </p>
    </header>

    <section
      aria-labelledby="tk-roles"
      class="flex flex-col gap-3"
    >
      <h2
        id="tk-roles"
        class="text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold text-(--tm-text)"
      >
        Colour roles
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div
          v-for="role in roles"
          :key="role.name"
          class="flex flex-col gap-2 rounded-(--tm-radius-lg) border border-(--tm-hairline) bg-(--tm-raised) p-3"
        >
          <span
            class="h-10 rounded-(--tm-radius-sm) border border-(--tm-hairline)"
            :style="{ background: `var(${role.name})` }"
          />
          <span class="text-[length:var(--tm-font-size-label)] leading-[var(--tm-line-label)] font-medium text-(--tm-text)">{{ role.label }}</span>
          <code class="text-[length:var(--tm-font-size-caption)] text-(--tm-text-muted)">{{ role.name }}</code>
        </div>
      </div>
    </section>

    <section
      aria-labelledby="tk-type"
      class="flex flex-col gap-3"
    >
      <h2
        id="tk-type"
        class="text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold text-(--tm-text)"
      >
        Type scale
      </h2>
      <div
        v-for="t in types"
        :key="t.label"
        class="flex flex-col gap-1 border-b border-(--tm-hairline) pb-3 md:flex-row md:items-baseline md:gap-4"
      >
        <span class="w-28 shrink-0 text-[length:var(--tm-font-size-caption)] text-(--tm-text-muted)">{{ t.label }}</span>
        <span
          :class="t.cls"
          class="text-(--tm-text)"
        >{{ t.sample }}</span>
      </div>
    </section>

    <section
      aria-labelledby="tk-space"
      class="flex flex-col gap-3"
    >
      <h2
        id="tk-space"
        class="text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold text-(--tm-text)"
      >
        Spacing and radii
      </h2>
      <div class="flex flex-col gap-2">
        <div
          v-for="s in spaces"
          :key="s.name"
          class="flex items-center gap-3"
        >
          <span class="w-28 text-[length:var(--tm-font-size-caption)] text-(--tm-text-muted)">{{ s.name }}</span>
          <span
            class="h-3 rounded-(--tm-radius-sm) bg-(--tm-accent)"
            :style="{ width: `${s.px}px` }"
          />
          <span class="text-[length:var(--tm-font-size-caption)] text-(--tm-text-muted)">{{ s.px }} px</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="r in radii"
          :key="r.name"
          class="flex flex-col items-start gap-1"
        >
          <span
            class="h-12 w-20 border border-(--tm-hairline-strong) bg-(--tm-raised)"
            :style="{ borderRadius: `var(${r.name})` }"
          />
          <span class="text-[length:var(--tm-font-size-caption)] text-(--tm-text-muted)">{{ r.label }}</span>
        </div>
      </div>
    </section>

    <section
      aria-labelledby="tk-states"
      class="flex flex-col gap-3"
    >
      <h2
        id="tk-states"
        class="text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold text-(--tm-text)"
      >
        Status states
      </h2>
      <p class="text-[length:var(--tm-font-size-label)] text-(--tm-text-muted)">
        Each state has a tone, a word and an icon. The colour is the hint; the word says it.
      </p>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="s in states"
          :key="s.name"
          class="tm-chip"
          :class="`tm-tone-${s.tone}`"
        >
          <UIcon
            :name="s.icon"
            class="size-3.5"
          />
          {{ s.name }}
        </span>
      </div>
    </section>

    <section
      aria-labelledby="tk-controls"
      class="flex flex-col gap-4"
    >
      <h2
        id="tk-controls"
        class="text-[length:var(--tm-font-size-section)] leading-[var(--tm-line-section)] font-semibold text-(--tm-text)"
      >
        Controls
      </h2>
      <p class="text-[length:var(--tm-font-size-label)] text-(--tm-text-muted)">
        Tab through these: each shows the amber focus ring.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="New task"
          icon="i-lucide-plus"
          color="primary"
        />
        <UButton
          label="Share"
          icon="i-lucide-share-2"
          color="neutral"
          variant="outline"
        />
        <UButton
          label="Delete permanently"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
        />
        <UButton
          label="Filter"
          icon="i-lucide-filter"
          color="neutral"
          variant="ghost"
        />
        <UButton
          aria-label="Project settings"
          icon="i-lucide-settings"
          color="neutral"
          variant="outline"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          color="success"
          variant="soft"
          label="Done"
        />
        <UBadge
          color="warning"
          variant="soft"
          label="At risk"
        />
        <UBadge
          color="error"
          variant="soft"
          label="Overdue"
        />
        <UBadge
          color="info"
          variant="soft"
          label="Shared"
        />
      </div>
      <div class="flex max-w-md flex-col gap-2">
        <label
          for="tk-input"
          class="text-[length:var(--tm-font-size-label)] font-medium text-(--tm-text-secondary)"
        >Task title</label>
        <input
          id="tk-input"
          type="text"
          placeholder="Task title…"
          class="h-9 rounded-(--tm-radius-md) border border-(--tm-hairline-strong) bg-(--tm-raised) px-3 text-[length:var(--tm-font-size-body)] text-(--tm-text) placeholder:text-(--tm-text-muted)"
        >
      </div>
      <div class="flex items-center gap-3">
        <span
          class="flex size-[22px] items-center justify-center rounded-(--tm-radius-pill) bg-[#A7F3D0] text-[length:var(--tm-font-size-caption)] font-semibold text-(--tm-text-on-accent)"
        >MD</span>
        <span
          class="flex size-[22px] items-center justify-center rounded-(--tm-radius-pill) bg-[#BFDBFE] text-[length:var(--tm-font-size-caption)] font-semibold text-(--tm-text-on-accent)"
        >PP</span>
        <span class="text-[length:var(--tm-font-size-label)] text-(--tm-text-muted)">Avatars: a face only when assigned.</span>
      </div>
    </section>
  </div>
</template>
