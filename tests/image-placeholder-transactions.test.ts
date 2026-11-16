// The placeholder transactions run for real: a ProseMirror schema built from the editor's own mark, and an editor stand-in
// whose dispatch applies each transaction to the state. A revert of the transaction code fails here, not only in a source regex.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSchema, Node } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { ImagePlaceholderMark, insertPlaceholders, placeholderRange, settleWithError, settleWithImage, updatePlaceholder } from '../app/utils/editor/imagePlaceholderMark'

const ImageNode = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { src: { default: null } }
  }
})

const schema = getSchema([Document, Paragraph, Text, ImageNode, ImagePlaceholderMark])

// An editor stand-in: the real state, moved on by each transaction the code dispatches.
function makeEditor(text: string) {
  const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, text ? [schema.text(text)] : [])])
  const editor = {
    schema,
    isDestroyed: false,
    state: EditorState.create({ schema, doc }),
    view: {
      dispatch(tr: unknown) {
        editor.state = editor.state.apply(tr as Parameters<EditorState['apply']>[0])
      }
    }
  }
  return editor
}

type Stand = ReturnType<typeof makeEditor>

const asEditor = (stand: Stand) => stand as unknown as Editor

function paragraphText(stand: Stand) {
  return stand.state.doc.textContent
}

function markedText(stand: Stand, id: string) {
  let text = ''
  stand.state.doc.descendants((node) => {
    if (node.isText && node.marks.some(mark => mark.type.name === 'imagePlaceholder' && mark.attrs.id === id)) text += node.text
  })
  return text
}

function markAttr(stand: Stand, id: string, attr: string) {
  let value: unknown
  stand.state.doc.descendants((node) => {
    const mark = node.marks.find(m => m.type.name === 'imagePlaceholder' && m.attrs.id === id)
    if (mark && value === undefined) value = mark.attrs[attr]
  })
  return value
}

function images(stand: Stand) {
  const found: string[] = []
  stand.state.doc.descendants((node) => {
    if (node.type.name === 'image') found.push(String(node.attrs.src))
  })
  return found
}

test('a pending placeholder inserts at the position, one per id, in order', () => {
  const stand = makeEditor('Hello ')
  insertPlaceholders(asEditor(stand), 7, ['a', 'b'])
  assert.equal(paragraphText(stand), 'Hello Uploading image… Uploading image…')
  assert.equal(markedText(stand, 'a'), 'Uploading image…')
  assert.equal(markedText(stand, 'b'), 'Uploading image…')
  assert.equal(markAttr(stand, 'a', 'state'), 'pending')
  assert.ok(placeholderRange(asEditor(stand), 'a'))
  assert.ok(placeholderRange(asEditor(stand), 'b'))
})

test('updatePlaceholder changes the progress of a pending placeholder and leaves the others', () => {
  const stand = makeEditor('')
  insertPlaceholders(asEditor(stand), 1, ['a', 'b'])
  updatePlaceholder(asEditor(stand), { id: 'a', state: 'pending', progress: 0.5 })
  assert.equal(markAttr(stand, 'a', 'progress'), 0.5)
  assert.equal(markAttr(stand, 'b', 'progress'), null)
  assert.equal(paragraphText(stand), 'Uploading image… Uploading image…')
})

test('settleWithImage replaces the placeholder with the image, and only that placeholder', () => {
  const stand = makeEditor('')
  insertPlaceholders(asEditor(stand), 1, ['a', 'b'])
  settleWithImage(asEditor(stand), 'a', 'https://files.example/a.png')
  assert.deepEqual(images(stand), ['https://files.example/a.png'])
  assert.equal(placeholderRange(asEditor(stand), 'a'), null)
  assert.equal(markedText(stand, 'b'), 'Uploading image…')
  assert.equal(paragraphText(stand), ' Uploading image…')
})

test('settleWithError replaces the placeholder with the failure line and its reason', () => {
  const stand = makeEditor('')
  insertPlaceholders(asEditor(stand), 1, ['a'])
  settleWithError(asEditor(stand), 'a', 'too large')
  assert.equal(paragraphText(stand), 'Image failed to upload: too large')
  assert.equal(placeholderRange(asEditor(stand), 'a'), null)
  assert.deepEqual(images(stand), [])
})

test('a placeholder the person removed is left alone by every later transaction', () => {
  const stand = makeEditor('')
  insertPlaceholders(asEditor(stand), 1, ['a'])
  const range = placeholderRange(asEditor(stand), 'a')
  assert.ok(range)
  stand.view.dispatch(stand.state.tr.delete(range.from, range.to))
  const before = stand.state.doc.toJSON()
  updatePlaceholder(asEditor(stand), { id: 'a', state: 'pending', progress: 0.9 })
  settleWithImage(asEditor(stand), 'a', 'https://files.example/a.png')
  settleWithError(asEditor(stand), 'a', 'boom')
  assert.deepEqual(stand.state.doc.toJSON(), before)
})

test('a destroyed editor is not written to', () => {
  const stand = makeEditor('')
  insertPlaceholders(asEditor(stand), 1, ['a'])
  const before = stand.state.doc.toJSON()
  stand.isDestroyed = true
  updatePlaceholder(asEditor(stand), { id: 'a', state: 'pending', progress: 0.9 })
  settleWithImage(asEditor(stand), 'a', 'https://files.example/a.png')
  assert.deepEqual(stand.state.doc.toJSON(), before)
})
