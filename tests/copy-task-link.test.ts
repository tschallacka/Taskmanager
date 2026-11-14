// The task link that the copy control puts on the clipboard: the html anchor and the absolute address. The clipboard
// itself needs a browser, so only the pure parts are tested here. Run:
//   node --import tsx --test tests/copy-task-link.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absoluteUrl, copyTaskLink, taskLinkHtml } from '../app/utils/copyTaskLink'
import { taskPanelPath } from '../app/utils/taskPanelUrl'
import { readFileSync } from 'node:fs'

test('the html is an anchor whose text is the task number', () => {
  const href = absoluteUrl('https://taskmanager.tschallacka.dev', taskPanelPath('p1', 't1'))
  assert.equal(taskLinkHtml(href, 't1'), '<a href="https://taskmanager.tschallacka.dev/projects/p1/t1">t1</a>')
})

test('an id with markup characters cannot break the html', () => {
  const html = taskLinkHtml('https://x.test/a"b', '<b>&')
  assert.equal(html, '<a href="https://x.test/a&quot;b">&lt;b&gt;&amp;</a>')
})

test('the absolute address has one slash between the origin and the path, with or without the trailing slash', () => {
  assert.equal(absoluteUrl('https://h.test/', '/projects/p1/t1'), 'https://h.test/projects/p1/t1')
  assert.equal(absoluteUrl('https://h.test', 'projects/p1'), 'https://h.test/projects/p1')
})

test('the Copied timer is cleared on a second click and on unmount', () => {
  const drawer = readFileSync(new URL('../app/components/kanban/TaskDrawer.vue', import.meta.url), 'utf8')
  // A second click clears the running timer before it starts a new one.
  assert.match(drawer, /clearTimeout\(copiedTimer\)\n {2}linkCopied\.value = true\n {2}copiedTimer = setTimeout/)
  // The unmount hook clears it, so no timer writes after the panel is gone.
  assert.match(drawer, /onBeforeUnmount\(\(\) => \{\n {2}clearTimeout\(copiedTimer\)/)
})

// The clipboard itself: a fake navigator, ClipboardItem and document stand in for the browser. Each test puts back
// what it replaced.
type Globals = Record<string, unknown>
function stubGlobals(values: Globals): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>()
  for (const key of Object.keys(values)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete (globalThis as Globals)[key]
    }
  }
}

class FakeClipboardItem {
  constructor(public items: Record<string, Blob>) {}
}

test('the clipboard receives the html anchor and the bare number, both as text', async () => {
  const written: FakeClipboardItem[] = []
  const restore = stubGlobals({
    ClipboardItem: FakeClipboardItem,
    navigator: { clipboard: { write: async (items: FakeClipboardItem[]) => { written.push(...items) } } }
  })
  try {
    const href = 'https://taskmanager.tschallacka.dev/projects/p1/t1'
    assert.equal(await copyTaskLink(href, 't1'), true)
    assert.equal(written.length, 1)
    const item = written[0]!.items
    assert.deepEqual(Object.keys(item).sort(), ['text/html', 'text/plain'])
    assert.equal(await item['text/html']!.text(), `<a href="${href}">t1</a>`)
    assert.equal(await item['text/plain']!.text(), 't1')
    assert.equal(item['text/html']!.type, 'text/html')
    assert.equal(item['text/plain']!.type, 'text/plain')
  } finally {
    restore()
  }
})

test('a refused clipboard resolves false and never throws', async () => {
  const restore = stubGlobals({
    ClipboardItem: FakeClipboardItem,
    navigator: { clipboard: { write: async () => { throw new Error('NotAllowedError') } } }
  })
  try {
    assert.equal(await copyTaskLink('https://h.test/projects/p1/t1', 't1'), false)
  } finally {
    restore()
  }
})

test('without ClipboardItem the html is copied through a selection, and the holder is removed afterwards', async () => {
  const commands: string[] = []
  const holders: { innerHTML: string; removed: boolean }[] = []
  const fakeDocument = {
    body: { appendChild: (node: { innerHTML: string; removed: boolean }) => { holders.push(node); return node } },
    createElement: () => ({ innerHTML: '', removed: false, style: {}, setAttribute: () => {}, remove() { this.removed = true } }),
    createRange: () => ({ selectNodeContents: () => {} }),
    execCommand: (command: string) => { commands.push(command); return true }
  }
  const restore = stubGlobals({
    ClipboardItem: undefined,
    navigator: {},
    document: fakeDocument,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) }
  })
  try {
    assert.equal(await copyTaskLink('https://h.test/projects/p1/t1', 't1'), true)
    assert.deepEqual(commands, ['copy'])
    assert.equal(holders.length, 1)
    assert.equal(holders[0]!.innerHTML, '<a href="https://h.test/projects/p1/t1">t1</a>')
    assert.equal(holders[0]!.removed, true)
  } finally {
    restore()
  }
})

test('without a clipboard and without a document the copy resolves false instead of crashing', async () => {
  const restore = stubGlobals({ ClipboardItem: undefined, navigator: {}, document: undefined })
  try {
    assert.equal(await copyTaskLink('https://h.test/projects/p1/t1', 't1'), false)
  } finally {
    restore()
  }
})
