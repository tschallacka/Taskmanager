// The image placeholders of a task description. An image pasted into the text gets an id and shows at once as "Uploading image…";
// its state moves from pending to done (with the image's URL) or failed (with the reason). Several can be in flight at once, each
// with its own state. The text keeps a token, [img:<id>], where the image goes; saving turns the tokens into content, and an unfinished
// placeholder is never saved as content.

export type PlaceholderState = 'pending' | 'done' | 'failed'

export interface Placeholder {
  id: string
  state: PlaceholderState
  /** 0 to 1 while pending; null when the stack reports no progress; 1 once done. */
  progress: number | null
  url?: string
  error?: string
}

export interface Placeholders {
  start(id: string): void
  progress(id: string, value: number): void
  done(id: string, url: string): void
  fail(id: string, reason: string): void
  get(id: string): Placeholder | undefined
  all(): Placeholder[]
}

export function createPlaceholders(): Placeholders {
  const items = new Map<string, Placeholder>()
  const pending = (id: string): Placeholder | undefined => {
    const item = items.get(id)
    return item && item.state === 'pending' ? item : undefined
  }
  return {
    start(id) {
      items.set(id, { id, state: 'pending', progress: null })
    },
    progress(id, value) {
      const item = pending(id)
      if (item) items.set(id, { ...item, progress: Math.min(1, Math.max(0, value)) })
    },
    done(id, url) {
      const item = pending(id)
      if (item) items.set(id, { id, state: 'done', progress: 1, url })
    },
    fail(id, reason) {
      const item = pending(id)
      if (item) items.set(id, { id, state: 'failed', progress: null, error: reason })
    },
    get: id => items.get(id),
    all: () => [...items.values()]
  }
}

const TOKEN = /\[img:([^\]\s]+)\]/g

/**
 * The text as it is saved: a done image becomes a Markdown image, a failed one a visible line with its reason, and a token with
 * no finished placeholder (still pending, or unknown) is dropped, so an unfinished image is never saved as content.
 */
export function saveText(text: string, placeholders: Placeholder[]): string {
  const byId = new Map(placeholders.map(item => [item.id, item]))
  return text.replace(TOKEN, (_, id: string) => {
    const item = byId.get(id)
    if (item?.state === 'done' && item.url) return `![image](${item.url})`
    if (item?.state === 'failed') return `[Image failed to upload: ${item.error ?? 'unknown error'}]`
    return ''
  })
}

/** The saved HTML without the pending placeholders: an unfinished image is never saved as content. Failed lines stay. */
export function stripPendingPlaceholders(html: string): string {
  return html.replace(/<span[^>]*data-image-placeholder="[^"]*"[^>]*data-state="pending"[^>]*>[\s\S]*?<\/span>/g, '')
}
