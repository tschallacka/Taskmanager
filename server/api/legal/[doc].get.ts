import { LEGAL_DOCUMENTS } from '#shared/utils/legalDocs'
import { currentLegalSources, legalPage } from '../../utils/legalPages'

// The current privacy policy or legal notice. Public (no session): a visitor reads it before signing up. A draft, or a
// document with an open placeholder, is 404 here and logged (server/utils/legalPages.ts).
export default defineEventHandler(async (event) => {
  const name = String(getRouterParam(event, 'doc') ?? '')
  if (!(LEGAL_DOCUMENTS as readonly string[]).includes(name)) throw createError({ statusCode: 404, message: 'Not found' })
  const files = await currentLegalSources(useStorage('assets:legal'))
  const page = legalPage(files, name)
  if (page.status !== 200) throw createError({ statusCode: 404, message: 'Not found' })
  return page.doc
})
