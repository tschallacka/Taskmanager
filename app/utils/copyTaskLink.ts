// Copies a link to a task in two formats (Boss, 2026-11-11, owner card mwcnnnpiw2qza030f1k): text/html, a link whose text is
// the task number, and text/plain, the bare number. Pasted into a rich editor it is a clickable number; pasted into a plain
// field it is the bare number. Where ClipboardItem is missing, a hidden element is selected and copied instead.

// The html of the link. Both the address and the label are escaped, so no id can break the markup.
export function taskLinkHtml(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
}

// The absolute address of a path on this server, with no double slash.
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Resolves true when the clipboard took the link, false when it refused. Never throws.
export async function copyTaskLink(href: string, label: string): Promise<boolean> {
  const html = taskLinkHtml(href, label)
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([label], { type: 'text/plain' })
        })
      ])
      return true
    }
    return copyWithSelection(html)
  } catch {
    return false
  }
}

// The fallback: the html is put in a hidden element, which is selected and copied by the browser.
function copyWithSelection(html: string): boolean {
  const holder = document.createElement('div')
  holder.innerHTML = html
  holder.setAttribute('contenteditable', 'true')
  holder.style.position = 'fixed'
  holder.style.opacity = '0'
  document.body.appendChild(holder)
  try {
    const range = document.createRange()
    range.selectNodeContents(holder)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return document.execCommand('copy')
  } finally {
    holder.remove()
  }
}
