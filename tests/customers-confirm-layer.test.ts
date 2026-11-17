// The "Remove customer?" confirmation of the Customers popup must open on top of the popup. The app gives every modal the
// same layer (app.config.ts: overlay and content z-70); the confirmation used to set its own z-[60], which is below that, so
// it opened behind the popup and could not be clicked. Source level: it reads the component, so it fails on the old layering.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the app gives modals the z-70 layer that the confirmation must share', () => {
  const config = read('app/app.config.ts')
  const modal = config.slice(config.indexOf('modal: {'))
  assert.match(modal, /overlay: 'z-70'/)
  assert.match(modal, /content: 'z-70'/)
})

test('the confirmation does not set a z-index below the modal layer', () => {
  const source = read('app/components/CustomersModal.vue')
  const confirm = source.slice(source.lastIndexOf('<UModal', source.indexOf('v-model:open="isConfirmOpen"')))
  const ui = confirm.slice(0, confirm.indexOf('>'))
  const zs = [...ui.matchAll(/z-\[(\d+)\]|z-(\d+)/g)].map(m => Number(m[1] ?? m[2]))
  for (const z of zs) assert.ok(z >= 70, `the confirmation z-${z} is below the modal layer z-70`)
})

test('the confirmation is declared after the customers popup, so at equal layer it stacks on top', () => {
  const source = read('app/components/CustomersModal.vue')
  const popup = source.indexOf('v-model:open="open"')
  const confirm = source.indexOf('v-model:open="isConfirmOpen"')
  assert.ok(popup > 0 && confirm > popup, 'the confirmation UModal comes after the popup UModal in the template')
})

test('a long confirmation title wraps and keeps clear of the close button (390 px)', () => {
  const source = read('app/components/CustomersModal.vue')
  const confirm = source.slice(source.lastIndexOf('<UModal', source.indexOf('v-model:open="isConfirmOpen"')))
  const ui = confirm.slice(0, confirm.indexOf('>'))
  assert.match(ui, /title: '[^']*break-words/, 'the title may break long words')
  assert.match(ui, /title: '[^']*pe-10/, 'the title leaves room for the close button')
})
