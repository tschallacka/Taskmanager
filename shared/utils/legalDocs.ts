// The legal documents (legal/privacy, legal/imprint): their front matter and body, and whether a document may be
// published. Pure: the files are read by server/utils/legalPages.ts. See legal/README.md for the rules.

export const LEGAL_DOCUMENTS = ['privacy', 'imprint'] as const
export type LegalDocument = typeof LEGAL_DOCUMENTS[number]

export interface LegalDoc {
  document: string
  title: string
  version: string
  effective: string
  changed: string
  language: string
  status: string
  body: string
  /** The open placeholders, `[[...]]`, without the brackets. */
  placeholders: string[]
}

const REQUIRED = ['document', 'title', 'version', 'effective', 'changed', 'language', 'status'] as const
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const PLACEHOLDER = /\[\[([^\]]+)\]\]/g

/** The document's front matter and body. A missing field, or no front matter, is an error that names it. */
export function parseLegalDoc(source: string): LegalDoc {
  const match = FRONT_MATTER.exec(source)
  if (!match) throw new Error('legal document has no front matter (--- ... ---)')
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) fields.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
  }
  for (const field of REQUIRED) {
    if (!fields.get(field)) throw new Error(`legal document has no ${field}`)
  }
  const body = source.slice(match[0].length)
  const placeholders = [...body.matchAll(PLACEHOLDER)].map(found => found[1]!.trim())
  return {
    document: fields.get('document')!,
    title: fields.get('title')!,
    version: fields.get('version')!,
    effective: fields.get('effective')!,
    changed: fields.get('changed')!,
    language: fields.get('language')!,
    status: fields.get('status')!,
    body,
    placeholders
  }
}

/** Why the document may not be published, or null when it may. A draft is never published; neither is one with a placeholder. */
export function publishBlocker(doc: LegalDoc): string | null {
  if (doc.status !== 'published') return 'status is draft'
  if (doc.placeholders.length) return `placeholders: ${doc.placeholders.join('; ')}`
  return null
}
