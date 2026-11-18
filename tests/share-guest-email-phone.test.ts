// The Share dialog's guest email field on a phone (about 390 px): the placeholder and a typed address show in full.
// The invite row is a flex-wrap form; the field has to take a full row below the sm breakpoint, or it is squeezed
// to about 90 px and the placeholder is cut. Source check. Run:
//   node --import tsx --test tests/share-guest-email-phone.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const share = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

function guestEmailField(): string {
  const at = share.indexOf('data-share-email')
  assert.ok(at >= 0, 'the guest email field carries data-share-email')
  const open = share.lastIndexOf('<UInput', at)
  const close = share.indexOf('/>', at)
  return share.slice(open, close + 2)
}

test('the guest email field keeps the placeholder "Add a guest by email…"', () => {
  assert.match(guestEmailField(), /placeholder="Add a guest by email…"/)
})

test('on a phone the guest email field takes a full row, so the placeholder and a typed address show in full', () => {
  const field = guestEmailField()
  const classes = /class="([^"]*)"/.exec(field)?.[1] ?? ''
  assert.match(classes, /\bbasis-full\b/, 'below sm the field is a full-width flex item (the row wraps above it)')
  assert.match(classes, /\bsm:flex-1\b/, 'from sm the field grows beside the role picker and the button again')
})

test('the field is not squeezed: below sm it has no flex-1 shrink-to-fit that leaves it about 90 px wide', () => {
  const classes = /class="([^"]*)"/.exec(guestEmailField())?.[1] ?? ''
  assert.doesNotMatch(classes, /(^|\s)flex-1(\s|$)/, 'a bare flex-1 (basis 0) would beat basis-full, so only sm:flex-1 is allowed')
})
