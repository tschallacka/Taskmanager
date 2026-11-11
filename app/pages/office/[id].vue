<script setup lang="ts">
import type { OfficeSnapshot } from '#shared/office/model'
import { DemoBoard } from '#shared/office/demo'
import type { HoverInfo, OfficeScene } from '~/office/office'
import { pollFailureOf, unseenAfter } from '~/office/pollFailure'

definePageMeta({ layout: 'app' })

// The crew's office in 3D: the board decides where every folder lies, and the crew walks them there.
// Live mode follows a board (a crew's shadow board, usually); demo mode plays every scene on a made-up one.
const route = useRoute()
const boardId = computed(() => String(route.params.id ?? 'demo'))
const demoOnly = computed(() => boardId.value === 'demo')

const host = ref<HTMLDivElement | null>(null)
const mode = ref<'live' | 'demo'>(demoOnly.value ? 'demo' : 'live')
const speed = ref(1)
const hover = ref<HoverInfo | null>(null)
const ticker = ref<{ id: number, at: string, line: string }[]>([])
const error = ref('')
const boardName = ref('')
const crewName = ref<string | null>(null)
const showLegend = ref(false)
const lag = ref(0)
const paused = ref(false)
const noWebGL = ref(false)
// A board the viewer cannot see: no room is drawn and polling stops. Set once, for this page visit.
const unseen = ref(false)
// Unseen 404s in a row for this visit; see unseenAfter.
const unseenStrikes = ref(0)

let scene: OfficeScene | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let demo: DemoBoard | null = null
let tickerSerial = 0

function addLine(line: string) {
  const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  ticker.value = [{ id: ++tickerSerial, at, line }, ...ticker.value].slice(0, 7)
}

function show(snap: OfficeSnapshot) {
  boardName.value = snap.boardName
  crewName.value = snap.crewName
  scene?.setSnapshot(snap)
  lag.value = scene?.backlog ?? 0
}

function stop() {
  if (timer) clearTimeout(timer)
  timer = null
}

async function pollLive() {
  stop()
  if (mode.value !== 'live' || unseen.value) return
  if (!document.hidden) {
    try {
      // A real board with more than one crew names the one it shows in ?crew=.
      const crew = typeof route.query.crew === 'string' ? route.query.crew : ''
      show(await $fetch<OfficeSnapshot>(`/api/projects/${boardId.value}/office`, { query: crew ? { crew } : undefined }))
      error.value = ''
      unseenStrikes.value = 0
    } catch (e) {
      const failure = pollFailureOf(e)
      // One 404 without a reason can come from a deploy or a route gap, so the room goes only after two in a row.
      const next = unseenAfter(unseenStrikes.value, failure)
      unseenStrikes.value = next.strikes
      if (next.unseen) {
        // The server answers 404 for a board the viewer cannot see. Such a board gets no room: the scene is
        // taken down and polling stops for this visit.
        unseen.value = true
        error.value = ''
        scene?.dispose()
        scene = null
        return
      }
      if (failure.kind === 'no-crew') error.value = 'No crew works on this board, so there is no office to show.'
      else error.value = 'Could not reach the board; trying again.'
    }
  }
  timer = setTimeout(pollLive, 3000)
}

function stepDemo() {
  stop()
  if (mode.value !== 'demo' || !demo) return
  // Wait for the crew to catch up rather than piling errands on them.
  if (!paused.value && !document.hidden && (scene?.backlog ?? 0) < 4) show(demo.advance())
  lag.value = scene?.backlog ?? 0
  timer = setTimeout(stepDemo, 2600 / speed.value)
}

/** One beat of the scenario now, whatever the crew is still busy with. For watching a single change land. */
function stepOnce() {
  if (mode.value === 'demo' && demo) show(demo.advance())
}

function start() {
  stop()
  scene?.reset()
  ticker.value = []
  unseenStrikes.value = 0
  error.value = ''
  if (mode.value === 'demo') {
    demo = new DemoBoard()
    show(demo.snapshot())
    timer = setTimeout(stepDemo, 1500)
  } else {
    demo = null
    void pollLive()
  }
}

watch(mode, start)
watch(speed, (value) => {
  if (scene) scene.speed = value
})

onMounted(async () => {
  const { openOfficeScene } = await import('~/office/openScene')
  if (!host.value) return
  // No WebGL means no room: the header and the board still load, and the page says so where the room would be.
  scene = openOfficeScene(host.value, {
    onTicker: addLine,
    onHover: (info) => {
      hover.value = info
    }
  })
  noWebGL.value = !scene
  // In development the scene is reachable from the console, e.g. `__office.startPong()`.
  if (import.meta.dev && scene) (window as unknown as { __office?: OfficeScene }).__office = scene
  start()
})

onBeforeUnmount(() => {
  stop()
  scene?.dispose()
  scene = null
})

const LEGEND = [
  ['📦', 'New tasks', 'A courier brings them in one parcel to the Boss, who unpacks it and carries the folders to Pia.'],
  ['📋', 'Assigned', 'Pia carries the folder to the worker\'s TODO tray, and knocks if they are asleep.'],
  ['⌨️', 'In progress', 'The worker takes it to the desk and works: typing, hammering, talking to a duck.'],
  ['✅', 'Handed in', 'The worker walks it to Pia\'s VERIFY PM tray.'],
  ['🧐', 'Review', 'It travels on to Usher (UX), Nina (code), Quincy (QA) and the Boss.'],
  ['↩️', 'Sent back', 'A reviewer stomps over and drops it back in the worker\'s tray.'],
  ['🚨', 'Blocked', 'It goes on the blocked shelf and the siren spins until it is rescued.'],
  ['🐛', 'Bug', 'Into the bug jar; one bug escapes for a lap of the office.'],
  ['🚀', 'Ready for live', 'Onto the launch pad, and the rocket goes up.'],
  ['🎉', 'Done', 'Filed in the archive, confetti for everyone awake.'],
  ['🗑️', 'Deleted', 'Fed to the shredder.'],
  ['🎮', 'Nothing to do', 'Dozing, scrolling the phone while swivelling, gaming on the work PC, two of them off to the ping-pong table, or a coffee or a cup of water from the cooler, sometimes with a chat. The Boss golfs or makes the rounds.']
] as const

useSeoMeta({ title: computed(() => (boardName.value ? `Office · ${boardName.value}` : 'Office')) })
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-4 py-2 lg:px-6">
      <UButton
        v-if="!demoOnly"
        :to="`/projects/${boardId}`"
        icon="i-lucide-arrow-left"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Back to the board"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-default">
          <NuxtLink
            v-if="mode === 'live' && boardName"
            :to="`/projects/${boardId}`"
            class="hover:underline"
          >{{ boardName }}</NuxtLink>
          <template v-else>
            {{ mode === 'demo' ? 'Demo office' : (boardName || 'Office') }}
          </template>
        </p>
        <p class="truncate text-xs text-muted">
          {{ mode === 'demo' ? 'A made-up board playing every scene' : (crewName ? `${crewName} at work` : 'Who carries what, live from the board') }}
        </p>
      </div>
      <UFieldGroup
        v-if="!demoOnly"
        size="xs"
      >
        <UButton
          :color="mode === 'live' ? 'primary' : 'neutral'"
          :variant="mode === 'live' ? 'solid' : 'outline'"
          icon="i-lucide-radio"
          data-office-live
          @click="mode = 'live'"
        >
          Live
        </UButton>
        <UButton
          :color="mode === 'demo' ? 'primary' : 'neutral'"
          :variant="mode === 'demo' ? 'solid' : 'outline'"
          icon="i-lucide-clapperboard"
          data-office-demo
          @click="mode = 'demo'"
        >
          Demo
        </UButton>
      </UFieldGroup>
      <UFieldGroup size="xs">
        <UButton
          v-for="s in [1, 2, 4]"
          :key="s"
          :color="speed === s ? 'primary' : 'neutral'"
          :variant="speed === s ? 'soft' : 'outline'"
          @click="speed = s"
        >
          {{ s }}×
        </UButton>
      </UFieldGroup>
      <UFieldGroup
        v-if="mode === 'demo'"
        size="xs"
      >
        <UButton
          :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
          color="neutral"
          variant="outline"
          data-office-pause
          @click="paused = !paused"
        >
          {{ paused ? 'Play' : 'Pause' }}
        </UButton>
        <UButton
          icon="i-lucide-skip-forward"
          color="neutral"
          variant="outline"
          data-office-step
          @click="stepOnce"
        >
          Next step
        </UButton>
      </UFieldGroup>
      <UButton
        icon="i-lucide-circle-help"
        size="xs"
        color="neutral"
        :variant="showLegend ? 'soft' : 'ghost'"
        @click="showLegend = !showLegend"
      >
        <span class="hidden sm:inline">What happens</span>
      </UButton>
    </header>

    <div class="relative min-h-0 flex-1 overflow-hidden bg-[#1e2235]">
      <div
        v-if="!unseen"
        ref="host"
        class="absolute inset-0"
        data-office-canvas
      />

      <div
        v-if="unseen"
        class="absolute inset-0 flex items-center justify-center px-4"
        data-office-unseen
      >
        <p class="text-center text-sm text-white">
          This board is not one you can see.
          <NuxtLink
            to="/projects"
            class="whitespace-nowrap underline"
          >Back to your boards</NuxtLink>
        </p>
      </div>

      <div
        v-if="noWebGL && !unseen"
        class="absolute inset-0 flex items-center justify-center px-4"
      >
        <p class="text-center text-sm text-white">
          This browser cannot show the 3D office.
          <NuxtLink
            v-if="!demoOnly"
            :to="`/projects/${boardId}`"
            class="whitespace-nowrap underline"
          >Back to the board</NuxtLink>
        </p>
      </div>

      <p
        v-if="error && !unseen"
        class="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-error/90 px-3 py-1.5 text-xs text-white shadow"
      >
        {{ error }}
        <button
          v-if="mode === 'live'"
          class="ml-2 underline"
          @click="mode = 'demo'"
        >
          Watch the demo
        </button>
      </p>

      <ol
        class="pointer-events-none absolute bottom-3 left-3 flex max-w-[min(28rem,calc(100%-1.5rem))] flex-col gap-1"
        data-office-ticker
      >
        <li
          v-for="(item, i) in ticker"
          :key="item.id"
          class="truncate rounded-md bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur-sm"
          :style="{ opacity: 1 - i * 0.12 }"
        >
          <span class="mr-1.5 tabular-nums text-white/60">{{ item.at }}</span>{{ item.line }}
        </li>
      </ol>

      <p
        v-if="lag > 3"
        class="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/55 px-2.5 py-1 text-xs text-white"
      >
        Catching up on {{ lag }} errands…
      </p>

      <div
        v-if="hover"
        class="pointer-events-none absolute z-10 max-w-64 rounded-md bg-default px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-default"
        :style="{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }"
      >
        <p class="font-semibold text-default">
          {{ hover.kind === 'folder' ? '📁 ' : '' }}{{ hover.title }}
        </p>
        <p class="text-muted">
          {{ hover.detail }}
        </p>
      </div>

      <div
        v-if="showLegend"
        class="absolute right-3 top-3 max-h-[calc(100%-1.5rem)] w-80 overflow-y-auto rounded-lg bg-default/95 p-3 text-xs shadow-xl ring-1 ring-default backdrop-blur"
      >
        <p class="mb-2 font-semibold text-default">
          How the board plays out
        </p>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="[icon, name, text] in LEGEND"
            :key="name"
            class="flex gap-2"
          >
            <span class="w-5 shrink-0 text-center">{{ icon }}</span>
            <span><span class="font-medium text-default">{{ name }}.</span> <span class="text-muted">{{ text }}</span></span>
          </li>
        </ul>
        <p class="mt-2 text-dimmed">
          Drag to turn the office, scroll to zoom, hover a folder or a person.
        </p>
      </div>
    </div>
  </div>
</template>
