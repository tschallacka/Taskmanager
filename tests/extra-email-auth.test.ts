// The sign-in and account hooks in server/lib/auth.ts, seen from outside, on the dev copy: an account with an
// extra address refuses an email code, signs in through the extra address with the main address's password,
// keeps two-factor on, and an anonymous request to the account's address list gets 401. Needs the dev copy
// with the email-code route on (NUXT_PUBLIC_EMAIL_CODE_ENABLED=true) and the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes TEST_BASE_URL=http://localhost:3042 node --import tsx --test tests/extra-email-auth.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { noBaseReason, resolveTestBase } from './helpers/testBase'

const base = resolveTestBase()
const SKIP = base ? false : noBaseReason()
const tag = randomBytes(4).toString('hex')
const password = `pw-${randomBytes(12).toString('hex')}`
const mainEmail = `${tag}-main@hooks.test`
const extraEmail = `${tag}-extra@hooks.test`
const plainEmail = `${tag}-plain@hooks.test`

const { db } = await import('../server/db')
const { user, userEmail } = await import('../server/db/schema')

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': base, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  })
}

async function signUp(name: string, email: string) {
  const res = await post('/api/auth/sign-up/email', { name, email, password })
  assert.equal(res.status, 200, `sign-up of ${email} answered ${res.status}`)
  return (await res.json()).user.id as string
}

before(async () => {
  if (SKIP) return
  const mainId = await signUp('Hooks main', mainEmail)
  await signUp('Hooks plain', plainEmail)
  await db.insert(userEmail).values({ id: `hooks-${tag}-extra`, userId: mainId, email: extraEmail, verifiedAt: new Date(), createdAt: new Date() })
})

after(async () => {
  if (SKIP) return
  await db.delete(userEmail).where(eq(userEmail.email, extraEmail))
  await db.delete(user).where(inArray(user.email, [mainEmail, plainEmail]))
  await db.$client.end()
})

test('an anonymous request to the account address list gets 401, for reading and for adding', { skip: SKIP }, async () => {
  const read = await fetch(`${base}/api/account/emails`)
  assert.equal(read.status, 401)
  const write = await post('/api/account/emails', { email: 'someone@hooks.test' })
  assert.equal(write.status, 401)
})

test('an email code never signs in to an account with an extra address, by either address', { skip: SKIP }, async () => {
  for (const email of [extraEmail, mainEmail]) {
    const res = await post('/api/auth/sign-in/email-otp', { email, otp: '000000' })
    assert.equal(res.status, 403, `${email} must be refused`)
    assert.match((await res.json()).message, /extra addresses/)
  }
})

test('an account without extra addresses is not refused by that rule', { skip: SKIP }, async () => {
  const res = await post('/api/auth/sign-in/email-otp', { email: plainEmail, otp: '000000' })
  assert.notEqual(res.status, 403)
})

test('an extra address signs in with the main address password and names the main address', { skip: SKIP }, async () => {
  const res = await post('/api/auth/sign-in/email', { email: extraEmail, password })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).user.email, mainEmail)
})

test('two-factor cannot be turned off while an extra address is on the account', { skip: SKIP }, async () => {
  const signIn = await post('/api/auth/sign-in/email', { email: extraEmail, password })
  const cookie = signIn.headers.getSetCookie().map(part => part.split(';')[0]).join('; ')
  const res = await post('/api/auth/two-factor/disable', { password }, cookie)
  assert.equal(res.status, 403)
  assert.match((await res.json()).message, /Remove your extra addresses before you turn off two-factor/)
})
