// The routes a crew-scoped token may call (card mwdd9d2vtgqhfr6izq): POST /api/crews/<slug>/keys and POST
// /api/crews/<slug>/people, for the one crew the token names. Every other route refuses it with the board sentence.
// Pure: the middleware (server/middleware/crewKeyScope.ts) does the database part.
export const SCOPED_TOKEN_SENTENCE = 'This token works on its own board only.'
const SCOPED_ROUTE = /^\/api\/crews\/([^/]+)\/(keys|people)$/

/** The crew slug a scoped token may call on this request, or null when the request is not one of its two routes. */
export function scopedSlugOf(method: string, path: string): string | null {
  const match = SCOPED_ROUTE.exec(path.split('?')[0] ?? '')
  if (method !== 'POST' || !match) return null
  return decodeURIComponent(match[1] ?? '')
}

/**
 * Whether a crew-scoped key may make this request: the route is one of its two, and the crew the route names is the
 * crew the key was made for. `slugCrewId` is the id of the crew with that slug (null when no crew has it). The middleware
 * does the lookup; this decides, so the refusal rule is tested without a database.
 */
export function scopedAllows({ method, path, keyCrewId, slugCrewId }: { method: string, path: string, keyCrewId: string, slugCrewId: string | null }): boolean {
  if (scopedSlugOf(method, path) === null) return false
  return slugCrewId !== null && slugCrewId === keyCrewId
}
