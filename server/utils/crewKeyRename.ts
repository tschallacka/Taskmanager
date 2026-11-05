// The crew's person keys were renamed: workers w1..w4 became wren, wick, wynn and wade, the usability
// tester pietje became usher, the project manager pm became pia and the code reviewer nitpicker became
// nina. A crew made before the rename has the old keys in three places: the account address
// (<slug>-<key>@crew.invalid, a fork's is <slug>-f<id>-<key>@...), the name of the account's key
// ("crew w1") and the key of a fork member row. This moves all three to the new keys. It is idempotent,
// so it runs on every start and costs a few queries once there is nothing left to move.
import { and, eq, isNotNull, like } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, crewBoardMembers, user } from '../db/schema'

export const RENAMED_PERSON_KEYS: Record<string, string> = {
  w1: 'wren',
  w2: 'wick',
  w3: 'wynn',
  w4: 'wade',
  pietje: 'usher',
  pm: 'pia',
  nitpicker: 'nina'
}

const DOMAIN = '@crew.invalid'

export interface RenameCount {
  accounts: number
  keys: number
  members: number
}

/** Moves every crew account, key name and fork member row from an old person key to its new one. */
export async function renameCrewPersonKeys(): Promise<RenameCount> {
  const count: RenameCount = { accounts: 0, keys: 0, members: 0 }

  for (const [from, to] of Object.entries(RENAMED_PERSON_KEYS)) {
    const accounts = await db.select({ id: user.id, email: user.email }).from(user)
      .where(and(isNotNull(user.crewId), like(user.email, `%-${from}${DOMAIN}`)))
    for (const account of accounts) {
      const email = `${account.email.slice(0, account.email.length - `-${from}${DOMAIN}`.length)}-${to}${DOMAIN}`
      // An address that is taken is left alone: renaming over another account would merge two people.
      const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
      if (taken) continue
      await db.update(user).set({ email }).where(eq(user.id, account.id))
      count.accounts += 1
    }

    const keys = await db.update(apiKeys).set({ name: `crew ${to}` })
      .where(eq(apiKeys.name, `crew ${from}`)).returning({ id: apiKeys.id })
    count.keys += keys.length

    // The fork rows are unique per board link and key, so a link that already has the new key is skipped.
    const members = await db.select({ id: crewBoardMembers.id, linkId: crewBoardMembers.linkId }).from(crewBoardMembers)
      .where(eq(crewBoardMembers.personKey, from))
    for (const row of members) {
      const [taken] = await db.select({ id: crewBoardMembers.id }).from(crewBoardMembers)
        .where(and(eq(crewBoardMembers.linkId, row.linkId), eq(crewBoardMembers.personKey, to))).limit(1)
      if (taken) continue
      await db.update(crewBoardMembers).set({ personKey: to }).where(eq(crewBoardMembers.id, row.id))
      count.members += 1
    }
  }
  return count
}
