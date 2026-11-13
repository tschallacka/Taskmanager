<script setup lang="ts">
// Your own picture and display name, in Settings, Account. A picture is cropped to a square and made 256 px in the browser
// (an SVG is sent as it is: the server checks it). The name is edited inline with save and cancel.
const toast = useToast()
const props = defineProps<{ userId: string, name: string | null, email: string | null, image: string | null }>()
const emit = defineEmits<{ changed: [] }>()

const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// The picture: crop to a square, 256 px, as PNG. An SVG goes up unchanged.
async function squarePng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize a picture.')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))), 'image/png'))
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  busy.value = true
  try {
    const body = new FormData()
    body.append('file', file.type === 'image/svg+xml' ? file : await squarePng(file), file.type === 'image/svg+xml' ? file.name : 'avatar.png')
    await $fetch('/api/account/avatar', { method: 'POST', body })
    toast.add({ title: 'Picture saved', icon: 'i-lucide-check', duration: 2500 })
    emit('changed')
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } })?.data?.message ?? 'Could not save the picture', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function removePicture() {
  busy.value = true
  try {
    await $fetch('/api/account/avatar', { method: 'DELETE' })
    toast.add({ title: 'Picture removed', icon: 'i-lucide-check', duration: 2500 })
    emit('changed')
  } catch {
    toast.add({ title: 'Could not remove the picture', color: 'error' })
  } finally {
    busy.value = false
  }
}

// The name: edited in place; 1 to 60 characters, trimmed.
const editing = ref(false)
const draft = ref('')
// The same rule as the server (server/utils/avatarRules.ts displayNameOf): 1 to 60 characters once trimmed.
const nameProblem = computed(() => {
  const length = draft.value.trim().length
  if (length < 1) return 'A name must have at least one character.'
  if (length > 60) return 'A name must be 60 characters or fewer.'
  return null
})

function startEdit() {
  draft.value = props.name ?? ''
  editing.value = true
}

async function saveName() {
  if (nameProblem.value) return
  busy.value = true
  try {
    await $fetch('/api/account/name', { method: 'PUT', body: { name: draft.value.trim() } })
    editing.value = false
    emit('changed')
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } })?.data?.message ?? 'Could not save the name', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 border-t border-default px-5 py-4">
    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/svg+xml"
      class="hidden"
      data-avatar-file
      @change="onFile"
    >
    <button
      class="rounded-full ring-primary transition-shadow hover:ring-2 focus-visible:ring-2"
      aria-label="Change picture"
      :disabled="busy"
      @click="fileInput?.click()"
    >
      <UserAvatar
        :user-id="userId"
        :name="name"
        :email="email"
        :image="image"
        size="xl"
      />
    </button>
    <div class="flex flex-wrap gap-2">
      <UButton
        label="Change picture"
        icon="i-lucide-image-up"
        size="sm"
        variant="soft"
        :loading="busy"
        @click="fileInput?.click()"
      />
      <UButton
        v-if="image"
        label="Remove picture"
        icon="i-lucide-image-minus"
        size="sm"
        variant="ghost"
        color="neutral"
        :disabled="busy"
        @click="removePicture"
      />
    </div>

    <div class="min-w-0 basis-full sm:basis-auto sm:flex-1">
      <template v-if="!editing">
        <button
          class="text-sm font-medium hover:underline"
          data-display-name
          @click="startEdit"
        >
          {{ name || 'Add a display name' }}
        </button>
      </template>
      <form
        v-else
        class="flex flex-wrap items-center gap-2"
        @submit.prevent="saveName"
      >
        <input
          v-model="draft"
          maxlength="80"
          aria-label="Display name"
          class="min-w-0 flex-1 rounded-md border border-default bg-default px-2 py-1 text-sm"
          data-display-name-input
          @keydown.escape="editing = false"
        >
        <UButton
          type="submit"
          label="Save"
          size="sm"
          :disabled="!!nameProblem"
          :loading="busy"
        />
        <UButton
          label="Cancel"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="editing = false"
        />
        <p
          v-if="nameProblem"
          class="basis-full text-xs text-error"
        >
          {{ nameProblem }}
        </p>
      </form>
    </div>
  </div>
</template>
