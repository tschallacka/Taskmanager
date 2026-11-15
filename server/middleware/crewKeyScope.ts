import { eq } from 'drizzle-orm'
import { db } from '../db'
import { crews } from '../db/schema'
import { findKey } from '../utils/api-keys'
import { SCOPED_TOKEN_SENTENCE, scopedAllows, scopedSlugOf } from '../utils/crewKeyScope'

// A crew-scoped token (card mwdd9d2vtgqhfr6izq, crew_id set) reaches one crew only, and only its keys and people routes.
// Every other route refuses it with the board sentence. A token without crew_id, and every other key, is not touched.
// The decision is scopedAllows (tested without a database); this only looks up the slug's crew.
export default defineEventHandler(async (event) => {
  const header = getHeader(event, 'authorization') ?? ''
  if (!header.startsWith('Bearer ')) return
  const token = header.slice('Bearer '.length).trim()
  if (!token) return
  const key = await findKey(token)
  if (!key || !key.crewId) return

  const path = event.path ?? ''
  const slug = scopedSlugOf(getMethod(event), path)
  const [crew] = slug === null ? [] : await db.select({ id: crews.id }).from(crews).where(eq(crews.slug, slug))
  if (scopedAllows({ method: getMethod(event), path, keyCrewId: key.crewId, slugCrewId: crew?.id ?? null })) return
  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: SCOPED_TOKEN_SENTENCE })
})
