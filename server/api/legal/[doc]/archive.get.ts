import { LEGAL_DOCUMENTS } from '#shared/utils/legalDocs'
import { archiveList } from '#shared/utils/legalArchive'
import { archivedLegalSources, currentLegalSources } from '../../../utils/legalPages'

// Every version of a legal document that was in force, newest first. Public, like the document itself.
export default defineEventHandler(async (event) => {
  const name = String(getRouterParam(event, 'doc') ?? '')
  if (!(LEGAL_DOCUMENTS as readonly string[]).includes(name)) throw createError({ statusCode: 404, message: 'Not found' })
  const storage = useStorage('assets:legal')
  const current = (await currentLegalSources(storage)).get(name) ?? ''
  const archived = await archivedLegalSources(storage, name)
  return { document: name, versions: archiveList(current, archived) }
})
