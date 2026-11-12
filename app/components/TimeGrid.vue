<script setup lang="ts">
import { format } from 'date-fns'
import { formatDuration } from '#shared/utils/duration'
import { dueDayToMs, todayIso } from '~/utils/dueDate'
import type { TimeEntry } from '~/composables/useTimeTracking'

// A week of logged time as a grid: a row per person or per task, a column per
// day, and the totals along both edges.
const props = defineProps<{
  entries: TimeEntry[]
  days: string[]
  by: 'person' | 'task'
}>()

const today = todayIso()

const rows = computed(() => {
  const byKey = new Map<string, { key: string, label: string, sub: string, image: string | null, perDay: Map<string, number>, total: number }>()
  for (const entry of props.entries) {
    const key = props.by === 'person' ? entry.author.id : entry.taskId
    let row = byKey.get(key)
    if (!row) {
      row = {
        key,
        label: props.by === 'person' ? entry.author.name : entry.taskTitle,
        sub: props.by === 'person' ? '' : entry.projectName,
        image: props.by === 'person' ? entry.author.image : null,
        perDay: new Map(),
        total: 0
      }
      byKey.set(key, row)
    }
    row.perDay.set(entry.day, (row.perDay.get(entry.day) ?? 0) + entry.minutes)
    row.total += entry.minutes
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total)
})

const dayTotals = computed(() => props.days.map(day => rows.value.reduce((sum, row) => sum + (row.perDay.get(day) ?? 0), 0)))
const grandTotal = computed(() => dayTotals.value.reduce((sum, minutes) => sum + minutes, 0))

function dayHead(day: string) {
  return format(dueDayToMs(day), 'EEE d')
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-default bg-default">
    <table
      class="w-full min-w-[40rem] border-collapse text-sm"
      data-time-grid
    >
      <thead>
        <tr class="border-b border-default text-xs text-muted">
          <th class="w-64 px-3 py-2 text-left font-medium">
            {{ by === 'person' ? 'Person' : 'Task' }}
          </th>
          <th
            v-for="day in days"
            :key="day"
            class="px-2 py-2 text-center font-medium"
            :class="day === today ? 'text-primary' : ''"
          >
            {{ dayHead(day) }}
          </th>
          <th class="px-3 py-2 text-right font-medium">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          class="border-b border-default last:border-b-0"
          data-time-row
        >
          <td class="px-3 py-2">
            <div class="flex items-center gap-2">
              <UserAvatar
                v-if="by === 'person'"
                :user-id="row.key"
                :name="row.label"
                :image="row.image"
                size="2xs"
              />
              <span class="min-w-0">
                <span class="block truncate text-default">{{ row.label }}</span>
                <span
                  v-if="row.sub"
                  class="block truncate text-xs text-dimmed"
                >{{ row.sub }}</span>
              </span>
            </div>
          </td>
          <td
            v-for="day in days"
            :key="day"
            class="px-2 py-2 text-center text-xs tabular-nums"
            :class="[row.perDay.get(day) ? 'text-default' : 'text-dimmed', day === today ? 'bg-primary/5' : '']"
            :data-minutes="row.perDay.get(day) ?? 0"
            data-time-cell
          >
            {{ row.perDay.get(day) ? formatDuration(row.perDay.get(day)!) : '·' }}
          </td>
          <td
            class="px-3 py-2 text-right text-xs font-medium tabular-nums text-default"
            :data-minutes="row.total"
            data-time-row-total
          >
            {{ formatDuration(row.total) }}
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td
            :colspan="days.length + 2"
            class="px-3 py-8 text-center text-xs text-dimmed"
          >
            No time logged this week.
          </td>
        </tr>
      </tbody>
      <tfoot v-if="rows.length">
        <tr class="border-t border-default bg-elevated/40 text-xs font-medium text-muted">
          <td class="px-3 py-2">
            Total
          </td>
          <td
            v-for="(minutes, i) in dayTotals"
            :key="days[i]"
            class="px-2 py-2 text-center tabular-nums"
            :data-minutes="minutes"
            data-time-day-total
          >
            {{ minutes ? formatDuration(minutes) : '·' }}
          </td>
          <td
            class="px-3 py-2 text-right tabular-nums text-default"
            :data-minutes="grandTotal"
            data-time-grand-total
          >
            {{ formatDuration(grandTotal) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
