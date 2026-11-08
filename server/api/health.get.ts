import { sql } from 'drizzle-orm'
import { db } from '../db'
import { APP_VERSION } from '../utils/appVersion'

export default defineEventHandler(async () => {
  await db.execute(sql`select 1`)
  return { status: 'ok', version: APP_VERSION }
})
