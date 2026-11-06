// Extra addresses on an account: who may add, confirm, keep and sign in with one, and how an invitation or a
// new account sees them. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/extra-emails.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray, sql } from 'drizzle-orm'

Object.assign(globalThis, { createError })
// Mail counts as switched on, so the checks that come after the mail check are reached. The port is closed:
// the confirmation mail fails at once, nothing is sent, and the failure is only logged.
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = '1'
process.env.SMTP_FROM = 'noreply@extra.test'

const { db } = await import('../server/db')
const { passkey, user, userEmail, verification } = await import('../server/db/schema')
const extra = await import('../server/utils/extraEmails')
const { accountByEmail } = await import('../server/utils/guests')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `xem-${tag}-${name}`
const mail = (name: string) => `${tag}-${name}@extra.test`
const now = new Date()

// main: two-factor on. other: holds a verified and a waiting extra address. bare: no second factor.
// keyOnly: two passkeys and no two-factor. keyOne: one passkey. stranger: a plain account.
const people = {
  main: { twoFactorEnabled: true },
  other: { twoFactorEnabled: false },
  bare: { twoFactorEnabled: false },
  keyOnly: { twoFactorEnabled: false },
  keyOne: { twoFactorEnabled: false },
  stranger: { twoFactorEnabled: false }
} as const
type Person = keyof typeof people
const ids = Object.fromEntries(Object.keys(people).map(name => [name, id(name)])) as Record<Person, string>
const allIds = Object.values(ids)

const noop = () => 'https://example.test/confirm-email/none'
let lastToken = ''
const capture = (token: string) => {
  lastToken = token
  return `https://example.test/confirm-email/${token}`
}

async function refuses(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(promise, (e: { statusCode?: number, message?: string }) => {
    assert.equal(e.statusCode, status, e.message)
    if (pattern) assert.match(e.message ?? '', pattern)
    return true
  })
}

before(async () => {
  await db.insert(user).values(Object.entries(people).map(([name, p]) => ({
    id: ids[name as Person],
    name,
    email: mail(name),
    emailVerified: true,
    twoFactorEnabled: p.twoFactorEnabled,
    createdAt: now,
    updatedAt: now
  })))
  await db.insert(userEmail).values([
    { id: id('verified-extra'), userId: ids.other, email: mail('verified-extra'), verifiedAt: now, createdAt: now },
    { id: id('pending-extra'), userId: ids.other, email: mail('pending-extra'), verifiedAt: null, createdAt: now }
  ])
  const key = (name: string, userId: string) => ({
    id: id(name),
    publicKey: 'test-key',
    userId,
    credentialID: id(`${name}-cred`),
    counter: 0,
    deviceType: 'singleDevice',
    backedUp: false,
    createdAt: now
  })
  await db.insert(passkey).values([key('p1', ids.keyOnly), key('p2', ids.keyOnly), key('p3', ids.keyOne)])
})

after(async () => {
  await db.delete(verification).where(sql`${verification.value} like ${`xem-${tag}%`}`)
  await db.delete(user).where(inArray(user.id, allIds))
  await db.$client.end()
})

test('an address is trimmed and lower-cased, and a malformed one is refused', () => {
  assert.equal(extra.cleanAddress('  Mixed@Case.TEST '), 'mixed@case.test')
  assert.equal(extra.cleanAddress('no-at-sign'), null)
  assert.equal(extra.cleanAddress('two words@extra.test'), null)
  assert.equal(extra.cleanAddress(42), null)
})

test('an address that another account has as its main address is refused as in use (Q95a)', async () => {
  await refuses(extra.startExtraEmail(ids.main, mail('other'), noop), 409, /already in use/)
})

test('an address that another account has as a verified extra address is refused as in use (Q95a)', async () => {
  await refuses(extra.startExtraEmail(ids.main, mail('verified-extra'), noop), 409, /already in use/)
})

test('a waiting extra address of another account does not block (Q95a)', async () => {
  const added = await extra.startExtraEmail(ids.main, mail('pending-extra'), noop)
  assert.equal(added.email, mail('pending-extra'))
  assert.equal(await extra.accountOfAddress(mail('pending-extra')), null)
})

test('the account\'s own main address is refused as an extra one', async () => {
  await refuses(extra.startExtraEmail(ids.main, mail('main').toUpperCase(), noop), 400, /main address/)
})

test('without two-factor or a passkey an extra address is refused (Q95b)', async () => {
  await refuses(extra.startExtraEmail(ids.bare, mail('bare-extra'), noop), 403, /two-factor/)
})

test('with two-factor on, an extra address waits for its confirmation link and is not yet the account\'s (Q95b)', async () => {
  const added = await extra.startExtraEmail(ids.main, mail('confirm-me'), capture)
  assert.equal(added.email, mail('confirm-me'))
  assert.ok(lastToken.length > 0)
  assert.equal(await extra.accountOfAddress(mail('confirm-me')), null)
  assert.ok(!(await extra.addressesOfUser(ids.main)).includes(mail('confirm-me')))
})

test('confirming needs the signed-in account that added the address (Q95b)', async () => {
  await refuses(extra.confirmExtraEmail(lastToken, ids.other), 403, /Sign in to the account/)
})

test('confirming through the link makes the address the account\'s, and the link works once (Q95b)', async () => {
  const confirmed = await extra.confirmExtraEmail(lastToken, ids.main)
  assert.equal(confirmed.email, mail('confirm-me'))
  const owner = await extra.accountOfAddress(mail('confirm-me'))
  assert.equal(owner?.userId, ids.main)
  assert.equal(owner?.mainEmail, mail('main'))
  assert.ok((await extra.addressesOfUser(ids.main)).includes(mail('confirm-me')))
  await refuses(extra.confirmExtraEmail(lastToken, ids.main), 410)
})

test('confirming is refused once the second factor is gone (Q95b)', async () => {
  await extra.startExtraEmail(ids.main, mail('late-factor'), capture)
  const token = lastToken
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, ids.main))
  try {
    await refuses(extra.confirmExtraEmail(token, ids.main), 403, /Turn on two-factor/)
  } finally {
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, ids.main))
  }
})

test('removing the last passkey is refused while extra addresses exist, and two-factor keeps the guard (Q95b)', async () => {
  // keyOnly has two passkeys: removing one leaves the other. keyOne has one: removing it leaves nothing.
  assert.equal(await extra.keepsSecondFactor(ids.keyOnly, id('p1')), true)
  assert.equal(await extra.keepsSecondFactor(ids.keyOne, id('p3')), false)
  assert.equal(await extra.keepsSecondFactor(ids.main, id('none')), true)
  assert.equal(await extra.hasSecondFactor(ids.bare), false)
  assert.equal(await extra.hasSecondFactor(ids.keyOne), true)
})

test('an account with a verified extra address is found by that address for an invitation (Q95c)', async () => {
  const row = await accountByEmail(mail('verified-extra'))
  assert.equal(row?.id, ids.other)
  assert.equal(await accountByEmail(mail('pending-extra')), null)
  assert.equal((await accountByEmail(mail('other')))?.id, ids.other)
})

test('an invitation matches the main and the verified extra addresses only (invitation accept)', async () => {
  const addresses = await extra.addressesOfUser(ids.other)
  assert.ok(addresses.includes(mail('other')))
  assert.ok(addresses.includes(mail('verified-extra')))
  assert.ok(!addresses.includes(mail('pending-extra')))
})

test('an extra address signs in as its main account: it names the main address (Q95d)', async () => {
  assert.equal(await extra.mainAddressForExtra(mail('verified-extra')), mail('other'))
  assert.equal(await extra.mainAddressForExtra(mail('pending-extra')), null)
  assert.equal(await extra.mainAddressForExtra(mail('other')), null)
})

test('only the owner of an account can remove one of its extra addresses', async () => {
  await refuses(extra.removeExtraEmail(ids.stranger, id('verified-extra')), 404)
  await extra.removeExtraEmail(ids.other, id('pending-extra'))
  assert.equal(await extra.accountOfAddress(mail('pending-extra')), null)
  await refuses(extra.removeExtraEmail(ids.other, id('pending-extra')), 404)
})
