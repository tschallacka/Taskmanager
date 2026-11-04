// The help pages in docs/, as plain functions: parse a page, cut it down to what one person may do,
// and search. Nothing here reads a file or knows who is asking; server/utils/helpStore.ts loads the
// pages and server/utils/helpAccess.ts works out what the asker may do.
//
// Help follows permissions. A page, and any section inside a page, names what it needs; a person who
// lacks it never sees it, not in the list, not in a search, not in a hint, not through Sprocket. A page
// they may not read is "not found", not "forbidden", so its title is not given away either.

/** What a person can do, as far as help is concerned. */
export const HELP_PERMISSIONS = [
  /** Works on boards in a workspace: a team member, or someone on their own workspace. */
  'staff',
  /** Logs in as a contact of a customer and sees only what is shared with customers. */
  'customer',
  /** Owner or admin of the active team. */
  'team-admin',
  /** Owner of the active team. */
  'team-owner',
  /** Runs the instance. */
  'instance-admin',
  /** May change data: not a read-only API key. */
  'write',
  /** May read project secrets. */
  'secrets',
  /** May manage crews: the instance admin, and a key with the crews permission. */
  'crews'
] as const

export type HelpPermission = typeof HELP_PERMISSIONS[number]

/**
 * What holding one permission always brings with it: an owner is an admin, an admin is staff, and managing crews
 * is for the instance admin. helpAccess.ts grants them together, so a page can rely on them.
 */
export const IMPLIED_PERMISSIONS: Readonly<Partial<Record<HelpPermission, readonly HelpPermission[]>>> = {
  'team-owner': ['team-admin', 'staff'],
  'team-admin': ['staff'],
  'crews': ['instance-admin']
}

/** The permissions in `list`, with everything they imply. */
export function withImplied(list: readonly HelpPermission[]): Set<HelpPermission> {
  const out = new Set<HelpPermission>(list)
  for (const permission of list) for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) out.add(implied)
  return out
}

export function isHelpPermission(value: string): value is HelpPermission {
  return (HELP_PERMISSIONS as readonly string[]).includes(value)
}

export interface HelpDoc {
  /** `crews/give-a-board-a-crew`: the path under docs/, without `.md`. */
  slug: string
  title: string
  summary: string
  /** The folder it sits in, which is the group it is listed under. */
  group: string
  topics: string[]
  /** Everything the reader needs before the page shows at all. */
  requires: HelpPermission[]
  order: number
  /** The page, front matter cut off, section markers still in. */
  body: string
}

export interface HelpDocView {
  slug: string
  title: string
  summary: string
  group: string
  topics: string[]
  /** The body for this reader: the sections they may not read are gone. */
  body: string
}

export interface HelpHit {
  slug: string
  title: string
  summary: string
  group: string
  /** A line of the page around the match, when the match was in the text. */
  snippet: string | null
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const OPEN_SECTION = /^\s*<!--\s*requires:\s*([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*-->\s*$/i
const CLOSE_SECTION = /^\s*<!--\s*\/requires\s*-->\s*$/i

function listOf(text: string | undefined): string[] {
  return (text ?? '').split(',').map(part => part.trim()).filter(Boolean)
}

/** Parses one page. Throws with the file named when the front matter is missing a title or names a permission that does not exist, so a typo cannot silently show a page to everyone. */
export function parseHelpDoc(slug: string, source: string): HelpDoc {
  const match = FRONT_MATTER.exec(source)
  if (!match) throw new Error(`docs/${slug}.md has no front matter (--- title: … ---)`)
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) fields.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
  }
  const title = fields.get('title')
  if (!title) throw new Error(`docs/${slug}.md has no title`)
  const requires = listOf(fields.get('requires'))
  for (const permission of requires) {
    if (!isHelpPermission(permission)) throw new Error(`docs/${slug}.md requires "${permission}", which is not a permission`)
  }
  const body = source.slice(match[0].length)
  checkSections(slug, body)
  return {
    slug,
    title,
    summary: fields.get('summary') ?? '',
    group: slug.includes('/') ? slug.slice(0, slug.indexOf('/')) : '',
    topics: listOf(fields.get('topics')).map(topic => topic.toLowerCase()),
    requires: requires as HelpPermission[],
    order: Number(fields.get('order')) || 1000,
    body
  }
}

function checkSections(slug: string, body: string): void {
  let open = 0
  body.split(/\r?\n/).forEach((line, index) => {
    const opens = OPEN_SECTION.exec(line)
    if (opens) {
      for (const permission of opens[1]!.split(',').map(part => part.trim().toLowerCase())) {
        if (!isHelpPermission(permission)) throw new Error(`docs/${slug}.md line ${index + 1}: "${permission}" is not a permission`)
      }
      open++
    } else if (CLOSE_SECTION.test(line)) {
      if (!open) throw new Error(`docs/${slug}.md line ${index + 1}: <!-- /requires --> closes nothing`)
      open--
    }
  })
  if (open) throw new Error(`docs/${slug}.md leaves a <!-- requires --> section open`)
}

/** Whether someone holding `held` has everything in `needed`. */
export function mayRead(needed: readonly HelpPermission[], held: ReadonlySet<HelpPermission>): boolean {
  return needed.every(permission => held.has(permission))
}

/** The body with the sections this reader may not see cut out, and the markers gone. */
export function bodyFor(body: string, held: ReadonlySet<HelpPermission>): string {
  const out: string[] = []
  // One entry per open section: whether its reader needs are met. Text shows only while all are.
  const stack: boolean[] = []
  for (const line of body.split(/\r?\n/)) {
    const opens = OPEN_SECTION.exec(line)
    if (opens) {
      stack.push(mayRead(opens[1]!.split(',').map(part => part.trim().toLowerCase()) as HelpPermission[], held))
      continue
    }
    if (CLOSE_SECTION.test(line)) {
      stack.pop()
      continue
    }
    if (stack.every(Boolean)) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The order the folders are read in: from the basics outwards, the instance admin's pages last. Other folders follow, by name. */
const GROUP_ORDER = ['', 'basics', 'workspace', 'team', 'crews', 'agents', 'integrations', 'admin']
const groupRank = (group: string) => {
  const rank = GROUP_ORDER.indexOf(group)
  return rank === -1 ? GROUP_ORDER.length : rank
}

/** The pages this reader may open, in reading order, each with its body already cut to what they may see. */
export function viewableDocs(docs: readonly HelpDoc[], held: ReadonlySet<HelpPermission>): HelpDocView[] {
  return docs
    .filter(doc => mayRead(doc.requires, held))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || a.order - b.order || a.title.localeCompare(b.title))
    .map(doc => ({ slug: doc.slug, title: doc.title, summary: doc.summary, group: doc.group, topics: doc.topics, body: bodyFor(doc.body, held) }))
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1)
}

/** Ranks the pages a reader may see against a question. Title and topics weigh most, then the summary, then the text. */
export function searchHelp(views: readonly HelpDocView[], query: string, limit = 8): HelpHit[] {
  const words = [...new Set(wordsOf(query))]
  if (!words.length) return []
  const scored: { view: HelpDocView, score: number, snippet: string | null }[] = []
  for (const view of views) {
    const title = view.title.toLowerCase()
    const topics = view.topics.join(' ')
    const summary = view.summary.toLowerCase()
    const body = view.body.toLowerCase()
    let score = 0
    let hits = 0
    for (const word of words) {
      const here = (title.includes(word) ? 6 : 0) + (topics.includes(word) ? 5 : 0) + (summary.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0)
      if (here) hits++
      score += here
    }
    // A page that answers more of the words beats one that repeats a single word.
    if (hits) scored.push({ view, score: score * hits, snippet: snippetFor(view.body, words) })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.view.title.localeCompare(b.view.title))
    .slice(0, limit)
    .map(({ view, snippet }) => ({ slug: view.slug, title: view.title, summary: view.summary, group: view.group, snippet }))
}

function snippetFor(body: string, words: string[]): string | null {
  // The line that answers the most of the words, the first of them on a tie.
  let line: string | null = null
  let best = 0
  for (const candidate of body.split('\n')) {
    if (!candidate.trim() || candidate.startsWith('#')) continue
    const lower = candidate.toLowerCase()
    const matched = words.filter(word => lower.includes(word)).length
    if (matched > best) {
      best = matched
      line = candidate
    }
  }
  if (!line) return null
  const text = line.replace(/[*_`>#-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}
