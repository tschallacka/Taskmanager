// Email privacy: an address is the owner's, and the slider decides how far it travels. The default is the
// narrowest step, and every step adds one more circle of readers. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/email-privacy.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { member, organization, projectGuests, projects, user } = await import('../server/db/schema')
const { EMAIL_AUDIENCES, emailAudienceOf, emailFor, maskEmails, parseEmailAudience, scrubMemberEmails, setEmailAudience } = await import('../server/utils/emailPrivacy')
const { personView } = await import('../server/utils/personCard')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tep-${tag}-${name}`
const now = Date.now()

const teamOwner = id('owner')
const teamAdmin = id('admin')
const subject = id('subject')
const teammate = id('teammate')
const guest = id('guest')
const stranger = id('stranger')
const team = id('team')
const board = id('board')
const users = [teamOwner, teamAdmin, subject, teammate, guest, stranger]
const address = (who: string) => `${who}@mail.test`

before(async () => {
  const at = new Date()
  await db.insert(user).values(users.map(u => ({ id: u, name: `Name ${u}`, email: address(u), emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values({ id: team, name: 'Privacy team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: teamOwner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: teamAdmin, role: 'admin', createdAt: at },
    { id: id('m3'), organizationId: team, userId: subject, role: 'member', createdAt: at },
    { id: id('m4'), organizationId: team, userId: teammate, role: 'member', createdAt: at }
  ])
  await db.insert(projects).values({ id: board, userId: teamOwner, teamId: team, name: 'Privacy board', createdAt: now, updatedAt: now })
  await db.insert(projectGuests).values({ id: id('g1'), projectId: board, userId: guest, role: 'editor', allowedDomain: null, addedBy: teamOwner, createdAt: now })
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

/** Whether the viewer sees the subject's address, at the level the subject has set. */
async function sees(viewer: string, level: (typeof EMAIL_AUDIENCES)[number]): Promise<boolean> {
  await setEmailAudience(subject, level)
  return (await emailFor(viewer, { id: subject, email: address(subject) })) === address(subject)
}

test('the default is the narrowest step: only the owner of an address sees it', async () => {
  assert.equal(await emailAudienceOf(subject), 'owner')
  for (const viewer of [teamOwner, teamAdmin, teammate, guest, stranger]) {
    assert.equal(await emailFor(viewer, { id: subject, email: address(subject) }), null, `${viewer} must not see it`)
  }
  assert.equal(await emailFor(subject, { id: subject, email: address(subject) }), address(subject))
})

test('every step adds one circle of readers and keeps the ones before it', async () => {
  const expected: Record<(typeof EMAIL_AUDIENCES)[number], string[]> = {
    owner: [subject],
    manager: [subject, teamOwner, teamAdmin],
    team: [subject, teamOwner, teamAdmin, teammate],
    guests: [subject, teamOwner, teamAdmin, teammate, guest],
    everyone: [subject, teamOwner, teamAdmin, teammate, guest, stranger]
  }
  for (const level of EMAIL_AUDIENCES) {
    const seen: string[] = []
    for (const viewer of [subject, teamOwner, teamAdmin, teammate, guest, stranger]) {
      if (await sees(viewer, level)) seen.push(viewer)
    }
    assert.deepEqual(seen.sort(), [...expected[level]].sort(), `readers at "${level}"`)
  }
})

test('a board manager counts as a manager even when the owner and viewer share no team', async () => {
  await setEmailAudience(subject, 'manager')
  const [plain] = await maskEmails(stranger, [{ id: subject, email: address(subject) }])
  assert.equal(plain!.email, null)
  const [managing] = await maskEmails(stranger, [{ id: subject, email: address(subject) }], { managesBoard: true })
  assert.equal(managing!.email, address(subject))
})

test('a list is masked per person, each by their own setting', async () => {
  await setEmailAudience(subject, 'everyone')
  await setEmailAudience(teammate, 'owner')
  const rows = await maskEmails(guest, [
    { id: subject, email: address(subject), name: 'S' },
    { id: teammate, email: address(teammate), name: 'T' }
  ], { sharesBoard: true })
  assert.deepEqual(rows.map(row => [row.name, row.email]), [['S', address(subject)], ['T', null]])
})

test('the person card follows the setting', async () => {
  await setEmailAudience(subject, 'owner')
  assert.equal((await personView(teamOwner, subject))!.person.email, null)
  await setEmailAudience(subject, 'guests')
  assert.equal((await personView(guest, subject))!.person.email, address(subject))
  assert.equal((await personView(stranger, subject)), null, 'a stranger still finds no card at all')
})

test('a team member list from the auth library is scrubbed for the viewer', async () => {
  await setEmailAudience(subject, 'manager')
  await setEmailAudience(teammate, 'owner')
  const body = {
    id: team,
    members: [
      { id: 'm-subject', userId: subject, role: 'member', user: { id: subject, name: 'S', email: address(subject) } },
      { id: 'm-teammate', userId: teammate, role: 'member', user: { id: teammate, name: 'T', email: address(teammate) } }
    ]
  }
  const asAdmin = await scrubMemberEmails(teamAdmin, body)
  assert.deepEqual(asAdmin.members.map(entry => entry.user.email), [address(subject), null])
  const asTeammate = await scrubMemberEmails(teammate, body)
  assert.deepEqual(asTeammate.members.map(entry => entry.user.email), [null, address(teammate)])
  const asNobody = await scrubMemberEmails(null, body)
  assert.deepEqual(asNobody.members.map(entry => entry.user.email), [null, null])
  assert.equal(body.members[0]!.user.email, address(subject), 'the original answer is not changed')
})

test('an answer without a member list passes through untouched', async () => {
  const other = { id: team, name: 'Privacy team' }
  assert.equal(await scrubMemberEmails(teamAdmin, other), other)
  assert.equal(await scrubMemberEmails(null, null), null)
})

test('only the five steps are accepted', () => {
  assert.deepEqual([...EMAIL_AUDIENCES], ['owner', 'manager', 'team', 'guests', 'everyone'])
  assert.equal(parseEmailAudience('team'), 'team')
  for (const bad of ['', 'public', 'EVERYONE', null, undefined, 3]) assert.equal(parseEmailAudience(bad), null)
})
