import { shallowReactive } from 'vue'
import { realtimeHeaders } from '~/composables/useRealtime'
import { untypedFetch } from '~/utils/untypedFetch'

// Which card ids on screen the reader may open, and each card's board and title. The server answers once per id and the
// answer is kept for the page, so a text that shows the same id twice asks once. A failed request is not kept, so it is
// asked again the next time the text is shown.

export interface OpenableCard {
  projectId: string
  title: string
}

const known = shallowReactive(new Map<string, OpenableCard | null>())
const pending = new Set<string>()

/** The card for an id, or null when the reader may not open it (or it is not asked for yet). */
export function openableCard(id: string): OpenableCard | null {
  return known.get(id) ?? null
}

/** Asks the server about the ids not yet known. Calls for ids already asked or answered do nothing. */
export function requestOpenableCards(ids: string[]): void {
  const wanted = [...new Set(ids)].filter(id => !known.has(id) && !pending.has(id))
  if (!wanted.length) return
  wanted.forEach(id => pending.add(id))
  untypedFetch<{ tasks: Record<string, OpenableCard> }>('/api/tasks/openable', {
    method: 'POST',
    headers: realtimeHeaders(),
    body: { ids: wanted }
  })
    .then((res) => {
      for (const id of wanted) known.set(id, res.tasks[id] ?? null)
    })
    .catch(() => {
      // Left unknown on purpose: the next showing asks again.
    })
    .finally(() => wanted.forEach(id => pending.delete(id)))
}
