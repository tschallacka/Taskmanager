// The one instance settings row (instance_settings, id 'instance') and the one way to write to it. Instance branding
// (brand.ts) and Sprocket (sprocketInstance.ts) both save through writeInstanceRow, so the fields the other one owns
// (crewsAllowed, rateLimits) are kept as they are.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { instanceSettings } from '../db/schema'

export const INSTANCE_ROW_ID = 'instance'

export type InstanceRowUpdate = Partial<typeof instanceSettings.$inferInsert>

/** Writes the given fields to the instance row, creating it when it does not exist yet. */
export async function writeInstanceRow(update: InstanceRowUpdate, userId: string): Promise<void> {
  const [existing] = await db
    .select({ crewsAllowed: instanceSettings.crewsAllowed, rateLimits: instanceSettings.rateLimits })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, INSTANCE_ROW_ID))
  const base = {
    id: INSTANCE_ROW_ID,
    crewsAllowed: existing?.crewsAllowed ?? false,
    rateLimits: existing?.rateLimits ?? null,
    updatedAt: Date.now(),
    updatedBy: userId
  }
  await db.insert(instanceSettings)
    .values({ ...base, ...update })
    .onConflictDoUpdate({ target: instanceSettings.id, set: update })
}
