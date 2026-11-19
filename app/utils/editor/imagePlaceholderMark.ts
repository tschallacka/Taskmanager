// The editor's image placeholder: a text mark that carries the placeholder's id and state, so it moves with the text while the person
// types around it. The mark renders as a span the saved HTML can recognise (see stripPendingPlaceholders); a pending one shows its
// progress as a bar through --progress.
import { Mark, mergeAttributes, type Editor } from '@tiptap/core'
import { placeholderBarStyle, placeholderLabel, type Placeholder, type PlaceholderState } from './imagePlaceholders'

export const ImagePlaceholderMark = Mark.create({
  name: 'imagePlaceholder',
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null },
      state: { default: 'pending' },
      progress: { default: null },
      error: { default: null }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-image-placeholder]' }]
  },
  renderHTML({ HTMLAttributes, mark }) {
    const state = String(mark.attrs.state) as PlaceholderState
    const progress = typeof mark.attrs.progress === 'number' ? mark.attrs.progress : null
    return ['span', mergeAttributes(HTMLAttributes, {
      'class': 'image-placeholder',
      'data-image-placeholder': mark.attrs.id,
      'data-state': state,
      'style': placeholderBarStyle(state, progress) || undefined
    }), 0]
  }
})

/** The range of the text carrying this placeholder's mark, or null when the person has removed it. */
export function placeholderRange(editor: Editor, id: string): { from: number, to: number } | null {
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    if (node.marks.some(mark => mark.type.name === 'imagePlaceholder' && mark.attrs.id === id)) {
      if (from < 0) from = pos
      to = pos + node.nodeSize
    }
  })
  return from < 0 ? null : { from, to }
}

function pendingNodes(editor: Editor, item: Placeholder) {
  const markType = editor.schema.marks.imagePlaceholder
  if (!markType) return []
  return [editor.schema.text(placeholderLabel(item), [markType.create({ id: item.id, state: item.state, progress: item.progress, error: item.error ?? null })])]
}

/** Puts a pending placeholder for each id at `at`, in order, before the uploads start. */
export function insertPlaceholders(editor: Editor, at: number, ids: string[]) {
  const nodes = ids.flatMap((id, i) => [
    ...(i > 0 ? [editor.schema.text(' ')] : []),
    ...pendingNodes(editor, { id, state: 'pending', progress: null })
  ])
  // The nodes are ProseMirror nodes, so they go in as a transaction; insertContentAt would read them as JSON.
  if (nodes.length) editor.view.dispatch(editor.state.tr.insert(at, nodes).scrollIntoView())
}

/** Updates a pending placeholder's progress. A placeholder the person has removed is left alone. */
export function updatePlaceholder(editor: Editor, item: Placeholder) {
  const range = placeholderRange(editor, item.id)
  if (!range || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.replaceWith(range.from, range.to, pendingNodes(editor, item)))
}

/** The finished upload: the placeholder becomes the image. */
export function settleWithImage(editor: Editor, id: string, src: string) {
  const range = placeholderRange(editor, id)
  if (!range || editor.isDestroyed) return
  const image = editor.schema.nodes.image
  if (!image) return
  editor.view.dispatch(editor.state.tr.replaceWith(range.from, range.to, image.create({ src })))
}

/** The failed upload: the placeholder becomes a visible line with the reason. It is kept until the person removes it. */
export function settleWithError(editor: Editor, id: string, reason: string) {
  const range = placeholderRange(editor, id)
  if (!range || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.replaceWith(range.from, range.to, editor.schema.text(placeholderLabel({ id, state: 'failed', progress: null, error: reason }))))
}
