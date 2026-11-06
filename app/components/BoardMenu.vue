<script setup lang="ts">
import type { BoardMenuBoard, BoardMenuOptions } from '~/composables/useBoardMenu'

// A board's menu, the same items wherever it is opened from. 'button' is the "⋯" control.
// 'context' wraps one element (a row, a link) and opens the menu on right-click, on the
// context-menu key and Shift+F10, and on a long press on a touch screen.
const props = withDefaults(defineProps<{
  board: BoardMenuBoard
  mode?: 'button' | 'context'
  rename?: BoardMenuOptions['rename']
  extra?: BoardMenuOptions['extra']
  buttonClass?: string
}>(), { mode: 'button', rename: undefined, extra: undefined, buttonClass: '' })

const { items, prepare } = useBoardMenu(() => props.board, () => ({ rename: props.rename, extra: props.extra }))

function onOpen(open: boolean) {
  if (open) prepare()
}

// Touch screens have no right-click: holding a finger on the element opens the same menu.
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10
const wrapper = ref<HTMLElement | null>(null)
let pressTimer: ReturnType<typeof setTimeout> | null = null
let pressStart = { x: 0, y: 0 }

function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  cancelPress()
  pressStart = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => {
    pressTimer = null
    // The element inside the wrapper is the one UContextMenu opens from.
    wrapper.value?.firstElementChild?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: pressStart.x,
      clientY: pressStart.y
    }))
  }, LONG_PRESS_MS)
}

function onPointerMove(event: PointerEvent) {
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > MOVE_TOLERANCE_PX) cancelPress()
}

onBeforeUnmount(cancelPress)
</script>

<template>
  <UDropdownMenu
    v-if="mode === 'button'"
    :items="items"
    :content="{ align: 'start', collisionPadding: 12 }"
    @update:open="onOpen"
  >
    <UButton
      icon="i-lucide-ellipsis"
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="Board options"
      :class="buttonClass"
      @click.stop
    />
  </UDropdownMenu>
  <span
    v-else
    ref="wrapper"
    class="contents"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="cancelPress"
    @pointercancel="cancelPress"
  >
    <UContextMenu
      :items="items"
      @update:open="onOpen"
    >
      <slot />
    </UContextMenu>
  </span>
</template>
