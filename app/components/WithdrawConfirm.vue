<script setup lang="ts">
// The question asked before an invitation is withdrawn: the link stops working at once, so Withdraw asks first.
// The Share dialog (guest invitations) and the team invites panel both use it, so the copy and the button stay the same.
// The parent keeps the invitation it asks about and does the withdrawal in its own confirm handler.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal
    v-model:open="open"
    title="Withdraw this invitation?"
    description="The link stops working for that address. You can invite the person again later."
  >
    <template #body>
      <div class="flex justify-end gap-2">
        <UButton
          label="Keep it"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Withdraw"
          color="error"
          data-invite-withdraw-confirm
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
