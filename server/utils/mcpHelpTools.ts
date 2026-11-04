// Help for an agent, and for Sprocket, which is an agent: the same pages /help shows, cut to what the
// key's person may do with the key's permissions. A page or a section about something the key could not
// do is not listed, not found by a search and not read, so help never describes a door that is shut.
import { McpToolError, optionalLimit, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'
import { searchViewerHelp, viewerDoc, viewerDocs } from './helpStore'
import type { ApiKeyContext } from './api-keys'

const viewerOf = (context: ApiKeyContext) => ({ userId: context.userId, teamId: context.teamId, scopes: context.scopes })

export const MCP_HELP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_help',
    title: 'Search the help',
    description: 'Search the Taskmanager help pages for how something works or how to do it (boards, tasks, time, customers, teams, rules, crews, keys, the GitHub link, agents). Returns the best matching pages with a line of each; read one in full with read_help. Only pages about what this key\'s person may do are searched. With no query, lists every page they may read. Use this before answering a "how do I" or "what is" question about Taskmanager itself.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in plain words: "give a board a crew", "customer visibility". Leave out to list the pages.' },
        limit: { type: 'number', description: 'Maximum pages to return (default 8, max 30).' }
      }
    },
    async handler(args, context) {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const limit = optionalLimit(args, 'limit', 8, 30)
      if (!query) {
        const docs = await viewerDocs(viewerOf(context))
        return { pages: docs.slice(0, limit === 8 ? docs.length : limit).map(({ slug, title, summary, group }) => ({ slug, title, summary, group })) }
      }
      return { pages: await searchViewerHelp(viewerOf(context), query, limit) }
    }
  },
  {
    name: 'read_help',
    title: 'Read a help page',
    description: 'Read one help page in full by the slug search_help gave (for example "crews/give-a-board-a-crew"). The text is Markdown. A page about something this key\'s person may not do is answered as not found.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The page, as search_help names it.' }
      },
      required: ['slug']
    },
    async handler(args, context) {
      const slug = requireString(args, 'slug')
      const doc = await viewerDoc(viewerOf(context), slug)
      if (!doc) throw new McpToolError(`There is no help page "${slug}" for you. Search with search_help to see the pages that exist.`)
      return { slug: doc.slug, title: doc.title, summary: doc.summary, markdown: doc.body }
    }
  }
]
