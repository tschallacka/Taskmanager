// The public legal pages: a document is served only when it may be published (shared/utils/legalDocs.ts). A draft, or a
// document with an open placeholder, answers 404 and writes one line to the log, so an operator sees why the page is
// missing. Takes the sources as a map so the rules are tested without the files.
import { LEGAL_DOCUMENTS, parseLegalDoc, publishBlocker } from '../../shared/utils/legalDocs'
import type { LegalDoc } from '../../shared/utils/legalDocs'

export type LegalPage = { status: 200, doc: LegalDoc } | { status: 404 }

/**
 * The archived versions of one document: the files under `archive/` with their key's file name. A key is
 * `legal:<document>:archive:<file>.md`. The file name is returned as it is; the dates come from the front matter.
 */
export async function archivedLegalSources(storage: { getKeys: () => Promise<string[]>, getItem: (key: string) => Promise<unknown> }, document: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const key of await storage.getKeys()) {
    const parts = key.split(':')
    // An archived version is named `<version>_<date>.md` (legal/README.md); anything else in the folder is not one.
    if (parts.length < 4 || parts.at(-2) !== 'archive' || parts.at(-3) !== document || !/^\d+\.\d+\.\d+_.+\.md$/.test(parts.at(-1) ?? '')) continue
    const source = await storage.getItem(key)
    if (typeof source === 'string') files.set(parts.at(-1)!, source)
  }
  return files
}

/**
 * The current version of each document, from the bundled assets. A key is `legal:<document>:current.md` (the
 * archive keys have `archive` in the document's place and are left out here).
 */
export async function currentLegalSources(storage: { getKeys: () => Promise<string[]>, getItem: (key: string) => Promise<unknown> }): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const key of await storage.getKeys()) {
    const parts = key.split(':')
    if (parts.at(-1) !== 'current.md' || parts.length < 2) continue
    const document = parts.at(-2)!
    if (!(LEGAL_DOCUMENTS as readonly string[]).includes(document)) continue
    const source = await storage.getItem(key)
    if (typeof source === 'string') files.set(document, source)
  }
  return files
}

export function legalPage(files: Map<string, string>, name: string, log: (line: string) => void = console.warn): LegalPage {
  const source = files.get(name)
  if (source === undefined) return { status: 404 }
  let doc: LegalDoc
  try {
    doc = parseLegalDoc(source)
  } catch (error) {
    log(`legal ${name}: not published, the document does not read (${(error as Error).message})`)
    return { status: 404 }
  }
  const blocker = publishBlocker(doc)
  if (blocker) {
    log(`legal ${name}: not published (${blocker}); the page answers 404 until the document is final`)
    return { status: 404 }
  }
  return { status: 200, doc }
}
