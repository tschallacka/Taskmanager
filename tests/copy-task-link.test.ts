// The task link that the copy control puts on the clipboard: the html anchor and the absolute address. The clipboard
// itself needs a browser, so only the pure parts are tested here. Run:
//   node --import tsx --test tests/copy-task-link.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absoluteUrl, taskLinkHtml } from '../app/utils/copyTaskLink'
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
  assert.match(drawer, /clearTimeout\(copiedTimer\)\n  linkCopied\.value = true\n  copiedTimer = setTimeout/)
  // The unmount hook clears it, so no timer writes after the panel is gone.
  assert.match(drawer, /onBeforeUnmount\(\(\) => \{\n  clearTimeout\(copiedTimer\)/)
})
