// The account routes read the signed-in user from the request context, as the other protected routes do.
// Calling the list route with a session must answer with that account's extra addresses. Needs the dev
// database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/account-emails-session.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'

Object.assign(globalThis, { createError })
// Nitro provides defineEventHandler as a global to the route files. Here it only has to return the handler.
Object.assign(globalThis, { defineEventHandler: (handler: unknown) => handler })

const { db } = await import('../server/db')
const { user, userEmail } = await import('../server/db/schema')
const { default: listEmails } = await import('../server/api/account/emails/index.get')
const { mailEnabled } = await import('../server/lib/mailer')

const tag = randomBytes(4).toString('hex')
const owner = `acc-${tag}-owner`
const ownerAddress = `${tag}-owner@accounts.test`
const verifiedAddress = `${tag}-verified@accounts.test`
const waitingAddress = `${tag}-waiting@accounts.test`
const at = new Date()

before(async () => {
  await db.insert(user).values({ id: owner, name: `Name ${owner}`, email: ownerAddress, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(userEmail).values([
    { id: `${owner}-verified`, userId: owner, email: verifiedAddress, verifiedAt: at, createdAt: at },
    { id: `${owner}-waiting`, userId: owner, email: waitingAddress, verifiedAt: null, createdAt: at }
  ])
})

after(async () => {
  await db.delete(userEmail).where(eq(userEmail.userId, owner))
  await db.delete(user).where(eq(user.id, owner))
  await db.$client.end()
})

test('the list route answers a signed-in account with its extra addresses, confirmed or waiting', async () => {
  const event = { context: { session: { user: { id: owner } } } }
  const answer = await (listEmails as unknown as (e: unknown) => Promise<{ mailEnabled: boolean, emails: { id: string, email: string, verified: boolean }[] }>)(event)
  const byEmail = Object.fromEntries(answer.emails.map(row => [row.email, row.verified]))
  assert.equal(answer.mailEnabled, mailEnabled)
  assert.equal(answer.emails.length, 2)
  assert.equal(byEmail[verifiedAddress], true)
  assert.equal(byEmail[waitingAddress], false)
})
