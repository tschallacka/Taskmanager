import { LEGAL_DOCUMENTS } from '#shared/utils/legalDocs'
import { archivedVersion } from '#shared/utils/legalArchive'
import { archivedLegalSources } from '../../../../utils/legalPages'

// One archived version, as it was in force. Public. Only archived versions: the current one is /api/legal/<doc>.
export default defineEventHandler(async (event) => {
  const name = String(getRouterParam(event, 'doc') ?? '')
  const version = String(getRouterParam(event, 'version') ?? '')
  if (!(LEGAL_DOCUMENTS as readonly string[]).includes(name) || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  const doc = archivedVersion(await archivedLegalSources(useStorage('assets:legal'), name), name, version)
  if (!doc) throw createError({ statusCode: 404, message: 'Not found' })
  return doc
})
