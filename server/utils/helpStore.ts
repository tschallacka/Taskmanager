// The help pages, read from docs/. They are bundled into the server build as server assets (see
// nitro.serverAssets in nuxt.config.ts), so a deployed instance has the same pages the repository has.
// A page that does not parse stops the load with its path named: a half-working help is worse than a
// loud one.
import { parseHelpDoc, searchHelp, viewableDocs } from '#shared/utils/helpDocs'
import type { HelpDoc, HelpDocView, HelpHit } from '#shared/utils/helpDocs'
import { helpPermissionsOf } from './helpAccess'
import type { HelpViewer } from './helpAccess'

let loaded: Promise<HelpDoc[]> | null = null

/** Every page, whoever may read it. Only the functions below hand pages to a caller, and only the ones they may read. */
export function allHelpDocs(): Promise<HelpDoc[]> {
  loaded ??= loadDocs().catch((error) => {
    loaded = null
    throw error
  })
  return loaded
}

async function loadDocs(): Promise<HelpDoc[]> {
  const storage = useStorage('assets:docs')
  const keys = (await storage.getKeys()).filter(key => key.endsWith('.md'))
  const docs: HelpDoc[] = []
  for (const key of keys) {
    const slug = key.replace(/:/g, '/').replace(/\.md$/, '')
    // The folder's own README is for readers of the repository, not a help page.
    if (slug.toLowerCase() === 'readme') continue
    const source = await storage.getItem<string>(key)
    if (typeof source !== 'string') continue
    docs.push(parseHelpDoc(slug, source))
  }
  return docs
}

export async function viewerDocs(viewer: HelpViewer): Promise<HelpDocView[]> {
  return viewableDocs(await allHelpDocs(), await helpPermissionsOf(viewer))
}

export async function searchViewerHelp(viewer: HelpViewer, query: string, limit?: number): Promise<HelpHit[]> {
  return searchHelp(await viewerDocs(viewer), query, limit)
}

/** One page for this reader, or null: a page they may not read does not exist for them. */
export async function viewerDoc(viewer: HelpViewer, slug: string): Promise<HelpDocView | null> {
  return (await viewerDocs(viewer)).find(doc => doc.slug === slug) ?? null
}
