<script setup lang="ts">
// The Customer access section of the project settings (redesign 8/9): which customer the project is filed under. The
// customer's contacts and the invitations are on the team's Customers page and on the board's Share dialog, as before;
// this section shows the state and does not change it.
defineProps<{ projectId: string }>()

const { activeProject } = useProjects()
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-default">
        Customer access
      </h3>
      <p class="mt-1 text-xs text-muted">
        A customer's contacts see the projects filed under that customer, and nothing else.
      </p>
    </div>

    <p
      class="text-sm text-default"
      data-customer-access
    >
      <template v-if="activeProject?.customerName">
        Filed under <strong>{{ activeProject.customerName }}</strong>.
      </template>
      <template v-else>
        Team only: no customer sees this project.
      </template>
    </p>

    <p class="text-xs text-muted">
      To change it, use Share on the board.
    </p>
  </div>
</template>
