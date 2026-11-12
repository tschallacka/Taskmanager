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
