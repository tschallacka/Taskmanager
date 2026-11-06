<script setup lang="ts">
import { errorMessage } from '~/utils/untypedFetch'
import { HEALTH, statusMeta, usePortfolios } from '~/composables/useGoals'
import type { Portfolio } from '~/composables/useGoals'

definePageMeta({ layout: 'app' })

const { sidebarOpen } = useSidebar()
useSeoMeta({ title: 'Portfolios' })

const { portfolios, loading, load, create, update, remove } = usePortfolios()
const toast = useToast()

onMounted(load)

function fail(e: unknown, fallback: string) {
  toast.add({ title: errorMessage(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

const name = ref('')
const editingId = ref<string | null>(null)

async function add() {
  const text = name.value.trim()
  if (!text) return
  name.value = ''
  try {
    editingId.value = (await create({ name: text })).id
  } catch (e) {
    fail(e, 'Could not add the portfolio')
  }
}

async function change(portfolio: Portfolio, body: Record<string, unknown>) {
  try {
    await update(portfolio.id, body)
  } catch (e) {
    fail(e, 'Could not save the portfolio')
  }
}

const deleting = ref<Portfolio | null>(null)
async function confirmDelete() {
  const portfolio = deleting.value
  deleting.value = null
  if (!portfolio) return
  try {
    await remove(portfolio.id)
  } catch (e) {
    fail(e, 'Could not delete the portfolio')
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 items-center gap-2 border-b border-default px-4 py-3 lg:px-6">
      <UButton
        icon="i-lucide-panel-left"
        color="neutral"
        variant="ghost"
        size="sm"
        class="lg:hidden"
        aria-label="Open sidebar"
        @click="sidebarOpen = true"
      />
      <h1 class="text-base font-semibold text-default">
        Portfolios
      </h1>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
      <div class="mx-auto max-w-4xl">
        <form
          class="mb-4 flex gap-2"
          @submit.prevent="add"
        >
          <UInput
            v-model="name"
            placeholder="Add a portfolio, such as “Marketing”"
            class="flex-1"
            :ui="{ root: 'w-full' }"
            data-portfolio-name
          />
          <UButton
            type="submit"
            label="Add portfolio"
            icon="i-lucide-plus"
            :disabled="!name.trim()"
            data-portfolio-add
          />
        </form>

        <p
          v-if="!portfolios.length && !loading"
          class="rounded-xl border border-dashed border-default p-8 text-center text-sm text-muted"
          data-portfolios-empty
        >
          A portfolio reads several projects side by side: how each is doing and how much of it is done.
        </p>

        <section
          v-for="portfolio in portfolios"
          :key="portfolio.id"
          class="mb-4 rounded-xl border border-default bg-default"
          :data-portfolio="portfolio.id"
        >
          <header class="flex flex-wrap items-center gap-3 px-4 py-3">
            <h2
              class="text-sm font-semibold text-default"
              data-portfolio-title
            >
              {{ portfolio.name }}
            </h2>
            <span class="flex items-center gap-3 text-xs text-muted">
              <span
                v-for="health in HEALTH"
                :key="health.key"
                class="flex items-center gap-1"
              >
                <span
                  class="size-2 rounded-full"
                  :class="health.dot"
                />
                {{ portfolio.health[health.key] }}
              </span>
            </span>
            <span class="ml-auto flex w-40 items-center gap-2">
              <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                <span
                  class="block h-full rounded-full bg-primary"
                  :style="{ width: `${portfolio.percent}%` }"
                />
              </span>
              <span
                class="w-9 text-right text-xs tabular-nums text-muted"
                data-portfolio-percent
              >{{ portfolio.percent }}%</span>
            </span>
            <UButton
              :icon="editingId === portfolio.id ? 'i-lucide-chevron-up' : 'i-lucide-settings-2'"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Edit portfolio"
              data-portfolio-edit
              @click="editingId = editingId === portfolio.id ? null : portfolio.id"
            />
          </header>

          <div
            v-if="portfolio.projects.length"
            class="overflow-x-auto border-t border-default"
          >
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-muted">
                <tr>
                  <th class="px-4 py-2 font-medium">
                    Project
                  </th>
                  <th class="px-2 py-2 font-medium">
                    Status
                  </th>
                  <th class="px-2 py-2 font-medium">
                    Done
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Latest update
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="project in portfolio.projects"
                  :key="project.id"
                  class="border-t border-default"
                  :data-portfolio-project="project.id"
                >
                  <td class="px-4 py-2">
                    <BoardMenu
                      mode="context"
                      :board="project"
                    >
                      <NuxtLink
                        :to="`/projects/${project.id}`"
                        class="font-medium text-default hover:underline"
                      >
                        {{ project.name }}
                      </NuxtLink>
                    </BoardMenu>
                  </td>
                  <td class="px-2 py-2">
                    <span class="flex items-center gap-1.5 text-xs text-muted">
                      <span
                        class="size-2 rounded-full"
                        :class="statusMeta(project.status)?.dot ?? 'bg-neutral-300'"
                      />
                      {{ statusMeta(project.status)?.label ?? 'Not set' }}
                    </span>
                  </td>
                  <td class="px-2 py-2">
                    <span class="flex items-center gap-2">
                      <span class="h-1.5 w-20 overflow-hidden rounded-full bg-elevated">
                        <span
                          class="block h-full rounded-full bg-primary"
                          :style="{ width: `${project.percent}%` }"
                        />
                      </span>
                      <span class="text-xs tabular-nums text-muted">{{ project.done }}/{{ project.total }}</span>
                    </span>
                  </td>
                  <td class="max-w-xs truncate px-4 py-2 text-xs text-muted">
                    {{ project.latestUpdate?.body || '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-else
            class="border-t border-default px-4 py-3 text-xs text-muted"
          >
            No projects yet. Open the settings to add some.
          </p>

          <div
            v-if="editingId === portfolio.id"
            class="space-y-3 border-t border-default px-4 py-4"
            data-portfolio-editor
          >
            <UInput
              :model-value="portfolio.name"
              size="sm"
              :ui="{ root: 'w-full' }"
              aria-label="Name"
              data-portfolio-edit-name
              @change="(e: Event) => change(portfolio, { name: (e.target as HTMLInputElement).value })"
            />
            <ProjectPicker
              :model-value="portfolio.projects.map(project => project.id)"
              @update:model-value="(ids: string[]) => change(portfolio, { projectIds: ids })"
            />
            <div class="flex justify-end">
              <UButton
                label="Delete portfolio"
                icon="i-lucide-trash-2"
                size="xs"
                color="error"
                variant="ghost"
                data-portfolio-delete
                @click="deleting = portfolio"
              />
            </div>
          </div>
        </section>
      </div>
    </div>

    <UModal
      :open="!!deleting"
      title="Delete this portfolio?"
      :description="deleting ? `“${deleting.name}” goes away. The projects in it are untouched.` : ''"
      @update:open="(open: boolean) => { if (!open) deleting = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="deleting = null"
          />
          <UButton
            label="Delete"
            color="error"
            data-portfolio-confirm-delete
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
