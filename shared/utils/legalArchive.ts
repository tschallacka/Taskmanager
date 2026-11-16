// The archive of a legal document (legal/README.md, "What the public pages show"): every version that was in force,
// newest first, with the day it took effect and the day it was replaced. The dates come from the front matter, never
// from the file names or the file times. A draft was never in force, so it is not listed. Pure.
import { parseLegalDoc, publishBlocker } from './legalDocs'
import type { LegalDoc } from './legalDocs'

export interface ArchiveEntry {
  version: string
  effective: string
  /** The day the next version took effect; null for the version in force now. */
  replacedOn: string | null
  current: boolean
}

function readDoc(source: string): LegalDoc | null {
  try {
    return parseLegalDoc(source)
  } catch {
    return null
  }
}

/** The versions of one document, newest first. `currentSource` is the document in force now; `archived` maps file names to sources. */
export function archiveList(currentSource: string, archived: Map<string, string>): ArchiveEntry[] {
  const current = readDoc(currentSource)
  const docs: { doc: LegalDoc, current: boolean }[] = []
  if (current && publishBlocker(current) === null) docs.push({ doc: current, current: true })
  for (const source of archived.values()) {
    const doc = readDoc(source)
    if (doc && doc.status === 'published') docs.push({ doc, current: false })
  }
  // Oldest first, to find what replaced each one; ties broken by version so the order is stable.
  const oldestFirst = [...docs].sort((a, b) => a.doc.effective.localeCompare(b.doc.effective) || a.doc.version.localeCompare(b.doc.version))
  const replacedOn = new Map<LegalDoc, string | null>()
  oldestFirst.forEach((entry, index) => replacedOn.set(entry.doc, oldestFirst[index + 1]?.doc.effective ?? null))
  return oldestFirst
    .map(entry => ({
      version: entry.doc.version,
      effective: entry.doc.effective,
      replacedOn: replacedOn.get(entry.doc) ?? null,
      current: entry.current
    }))
    .reverse()
}

/** One archived version, as it was, or null: unknown, another document's, or a draft. */
export function archivedVersion(archived: Map<string, string>, document: string, version: string): LegalDoc | null {
  for (const source of archived.values()) {
    const doc = readDoc(source)
    if (doc && doc.document === document && doc.version === version && doc.status === 'published') return doc
  }
  return null
}
