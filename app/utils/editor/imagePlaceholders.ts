// The image placeholders of a task description, as pure helpers. An image pasted into the text shows at once as a placeholder
// ("Uploading image…", a bar that fills with its progress) and settles into the image or a failure line. The editor keeps each
// placeholder's state in a ProseMirror mark (imagePlaceholderMark.ts); this file holds the parts that need no editor: the label,
// the bar's style, and the strip that keeps an unfinished placeholder out of the saved HTML.

export type PlaceholderState = 'pending' | 'done' | 'failed'

export interface Placeholder {
  id: string
  state: PlaceholderState
  /** 0 to 1 while pending; null when the stack reports no progress; 1 once done. */
  progress: number | null
  url?: string
  error?: string
}

/** The text a placeholder shows in the editor: "Uploading image…" while pending, the failure line with its reason once failed. */
export function placeholderLabel(item: Placeholder): string {
  if (item.state === 'failed') return `Image failed to upload: ${item.error ?? 'unknown error'}`
  return 'Uploading image…'
}

/**
 * The inline style of a placeholder's bar: a pending one fills to its progress (a fixed partial bar when the length is unknown),
 * the others have none.
 */
export function placeholderBarStyle(state: PlaceholderState, progress: number | null): string {
  if (state !== 'pending') return ''
  const value = progress ?? 0.3
  return `--progress: ${value}; background: linear-gradient(to right, rgba(127, 127, 127, 0.3) calc(var(--progress) * 100%), transparent 0); border-radius: 0.25rem;`
}

/** The saved HTML without the pending placeholders: an unfinished image is never saved as content. Failed lines stay. */
export function stripPendingPlaceholders(html: string): string {
  return html.replace(/<span[^>]*data-image-placeholder="[^"]*"[^>]*data-state="pending"[^>]*>[\s\S]*?<\/span>/g, '')
}

/**
 * Whether the server's copy of a description should replace what the editor shows. It should not when the editor already
 * matches it, when the answer is to one of our own saves (a late answer would put back the text from before the person typed),
 * or while an upload is pending: the placeholder is local state that the saved copy leaves out, so taking the server copy
 * would remove it and the upload would land nowhere.
 */
export function shouldAdoptServerDescription(serverHtml: string, editorHtml: string, ownSaves: readonly string[]): boolean {
  if (serverHtml === stripPendingPlaceholders(editorHtml)) return false
  if (ownSaves.includes(serverHtml)) return false
  if (/data-state="pending"/.test(editorHtml)) return false
  return true
}
