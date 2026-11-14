// The "Connect your Claude to this board" window: the permissions in plain words, the ways a key can be handed
// over, and the copy-paste prompt an agent is given. Pure, so the prompt is tested on its own.

/** The permissions a connect token can carry, in the order the window lists them. */
export const CONNECT_PERMISSIONS = [
  { scope: 'boards:read', label: 'Read boards and tasks', description: 'Boards, tasks, comments and time logs' },
  { scope: 'boards:write', label: 'Change tasks', description: 'Create, edit, move and delete tasks, comment, log time' },
  { scope: 'secrets:read', label: 'Read project secrets', description: 'Names and values of a project\'s secrets. Every read is recorded' },
  { scope: 'secrets:write', label: 'Change project secrets', description: 'Add, change and delete a project\'s secrets, where you are a project manager' },
  { scope: 'crews:manage', label: 'Let this agent make a crew for this board', description: 'The crew gets its own accounts and keys, and can read and write its own board. Only the instance admin can give this' }
] as const

export type ConnectScope = typeof CONNECT_PERMISSIONS[number]['scope']

/** The plain name of a permission, or the scope itself when it is unknown. */
export function permissionName(scope: string): string {
  return CONNECT_PERMISSIONS.find(permission => permission.scope === scope)?.label ?? scope
}

/** How a token reaches the agent. A pairing code is the default; the token itself is the fallback. */
export const CONNECT_METHODS: { label: string, value: 'code' | 'token' | 'browser', description: string }[] = [
  { label: 'Pairing code (recommended)', value: 'code', description: 'A one-time code. The agent exchanges it for the token, so the secret stays out of the chat.' },
  { label: 'Show the token itself', value: 'token', description: 'Fallback. Shown once. Do not paste it into a chat.' },
  { label: 'Browser verification', value: 'browser', description: 'Your Claude asks for the connection, and you approve it in this browser. Nothing secret goes into the chat.' }
] as const

export type ConnectMethod = 'code' | 'token' | 'browser'

/** Permission names for a list of scopes, joined for a sentence. */
export function permissionList(scopes: readonly string[]): string {
  return scopes.map(permissionName).join('; ')
}

export interface ConnectPromptBoard {
  /** The board's id, which the agent names when it asks for the connection. */
  id?: string
  name: string
  workspace: string
  scopes: readonly string[]
}

// The pipe that reads the exchange's reply. On success it writes the token, and only the token, into the variable. On a
// refusal it prints the server's message to stderr (the message never holds a key) and exits non-zero, so the variable
// stays empty and the agent sees why, instead of an "undefined" key.
const EXCHANGE_READER = `node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let r={};try{r=JSON.parse(s)}catch{}if(r.token){process.stdout.write(r.token);return}console.error("the exchange was refused: "+(r.message||r.statusMessage||"the server gave no message")+". No key was made. Report this message to your main agent and do not retry with this code.");process.exit(1)})'`

export interface ConnectPromptInput {
  /** The base URL of this Taskmanager, with no trailing slash. */
  origin: string
  /** The token's name, as the owner gave it. */
  tokenName: string
  boards: ConnectPromptBoard[]
  /** How the agent gets its token: the code it exchanges, the token itself, or the browser approval it asks for. */
  access: { kind: 'code', code: string, expiresAt: number } | { kind: 'token', token: string } | { kind: 'browser' }
  /** A key that reaches every board the owner can open: said in one line, instead of a list of boards. */
  allBoards?: { scopes: readonly string[] }
  /** A reconnect: the prompt removes the server that is already there before it adds it again. */
  replacing?: boolean
  /** What the agent does once the server is added, said last: the next step for the person, when the tools are not live yet. */
  afterAdd?: string
}

/**
 * The browser steps of a prompt. It carries only the address and the boards asked for, never a secret: the agent
 * asks for the connection, the person approves it in the browser, and the agent polls until it gets the token once.
 */
function browserSteps(origin: string, tokenName: string, boards: ConnectPromptBoard[]): string {
  const body = JSON.stringify({
    client_name: tokenName,
    boards: boards.filter(board => board.id).map(board => ({ boardId: board.id, scopes: [...board.scopes] }))
  })
  const quoted = body.replace(/'/g, `'\\''`)
  return [
    'Your key is not in this prompt. You get it by approval in the browser, in three steps:',
    '1. Ask for the connection. Keep the device_code of the reply to yourself, and do not print it:',
    `  curl -s -X POST ${origin}/api/pair/device -H 'Content-Type: application/json' -d '${quoted}'`,
    '2. Show me the verification_url and the user_code from the reply, and ask me to open the link and approve. I can take away boards and permissions, not add any.',
    '3. Poll with the device_code every "interval" seconds, until a reply says approved, denied or expired:',
    `  curl -s -X POST ${origin}/api/pair/device/poll -H 'Content-Type: application/json' -d '{"device_code":"<device_code>"}'`,
    '  "pending" means wait and poll again. "slow_down" means wait longer before the next poll.',
    '  "approved" holds the token, once. Put it in TASKMANAGER_API_KEY, and do not print it.',
    '  A refusal (denied, expired, or already used) is a message for me: stop, report it to your main agent, and do not retry.'
  ].join('\n')
}

/**
 * The copy-paste prompt for the agent: where the board is, the boards and what is allowed on each, how the agent
 * authenticates, and what to do on a refusal. A code prompt carries the code and never the token; a token prompt
 * carries the token, which the owner chose to show.
 */
export function connectPrompt(input: ConnectPromptInput): string {
  const boardLines = input.allBoards
    ? [`- All the boards you can open, including ones the owner gives later: ${permissionList(input.allBoards.scopes)}`]
    : input.boards.map(board => `- ${board.name} (${board.workspace}): ${permissionList(board.scopes)}`)
  const allScopes = new Set([...input.boards.flatMap(board => board.scopes), ...(input.allBoards?.scopes ?? [])])
  const crewLine = allScopes.has('crews:manage')
    ? 'A crew works on its own shadow board and never writes to the real board.\n'
    : ''
  const endpoint = `${input.origin}/api/mcp`

  const auth = input.access.kind === 'browser'
    ? browserSteps(input.origin, input.tokenName, input.boards)
    : input.access.kind === 'code'
      ? [
          `Your key is a one-time pairing code: ${input.access.code}`,
          `It works once and until ${new Date(input.access.expiresAt).toISOString()}. Exchange it on this machine, and do not print the result:`,
          `  export TASKMANAGER_API_KEY=$(curl -s -X POST ${input.origin}/api/pair -H 'Content-Type: application/json' -d '{"code":"${input.access.code}"}' | ${EXCHANGE_READER})`,
          'If that does not give you a key that starts with arn_, stop: the exchange was refused. Report the message the server sent to your main agent, and do not retry with this code.'
        ].join('\n')
      : [
          `Your key is the token below. Put it in the environment variable TASKMANAGER_API_KEY, and do not print it:`,
          `  ${input.access.token}`
        ].join('\n')

  // A reconnect: the server is already there, so it is removed first. The remove fails quietly when nothing is there yet,
  // and each line is a command of its own, so the add still runs.
  const replace = input.replacing
    ? `If Claude Code already has a taskmanager server (this is a reconnect), remove it first, or the add below fails. The remove is quiet when there is nothing to remove:\n  claude mcp remove --scope user taskmanager 2>/dev/null\n`
    : ''

  return `Connect to my Taskmanager at ${input.origin}, as the connection "${input.tokenName}".

Boards you may use, and what you may do on each:
${boardLines.join('\n')}
${crewLine}
Authentication
${auth}

${replace}Then add the MCP server, exactly as written (the single quotes matter):
  claude mcp add --scope user --transport http taskmanager ${endpoint} --header 'Authorization: Bearer \${TASKMANAGER_API_KEY}'

Never echo, print, log or paste the key anywhere else, and never send it to another service.

If a call is refused with 401 and a message, stop. Do not retry with this key. Report that message to your main agent, so they can ask me for a new connection.
If a board is not in the list above, you have no access to it, and you should not try.${input.afterAdd ? `\n\n${input.afterAdd}` : ''}`
}

/** A board the window can pick from: the boards the person can open. */
export interface ConnectBoardChoice {
  id: string
  name: string
  workspace: string
}

/** A board a token reaches, with what the token may do there. */
export interface ConnectTokenBoard {
  id: string
  name: string
  workspace: string
  scopes: string[]
}

/** One connect token as the window lists it (GET /api/settings/connect-tokens). */
export interface ConnectTokenRow {
  id: string
  name: string
  keyPrefix: string
  kind: 'access' | 'management'
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  expired: boolean
  scopes: string[]
  boards: ConnectTokenBoard[]
  /** The last pairing of this token: who used the code, and when. Null when no agent has paired yet. */
  pairedBy: { usedAt: number, usedFrom: string | null } | null
}

/** A connection the window has just made or changed: what the owner copies once, and the prompt that goes with it. */
export interface IssuedConnection {
  /** The panel's title, for example "Connection ready" or "New secret". */
  title: string
  tokenName: string
  boards: ConnectPromptBoard[]
  access: ConnectPromptInput['access']
}

/** What a key's prompt needs: the key's name, what it reaches, and the access the agent gets. */
export interface KeyPromptInput {
  origin: string
  /** The key's name, as the owner gave it. */
  name: string
  /** The boards the key reaches, or every board the owner can open. */
  reach: { boards: ConnectPromptBoard[], allBoards?: { scopes: readonly string[] } }
  /** The one-time pairing code for the key. Null when it could not be made; the prompt then has a placeholder. */
  pairing: { code: string, expiresAt: number } | null
  /** The key itself. Written in only when the owner chooses it. */
  token: string | null
  mode: 'code' | 'token'
}

/** Where the key goes when the prompt is shown before any key exists. It is never a real key. */
export const KEY_PLACEHOLDER = '<paste the key here>'

/**
 * The one prompt a key gives. Pairing is the default: the prompt carries a one-time code the agent exchanges, so the
 * key stays out of the chat. The key goes in only when the owner chooses it. The prompt always removes an existing
 * taskmanager server first, so the same paste fits a first setup and a reconnect.
 */
export function keyPrompt(input: KeyPromptInput): string {
  const access = input.mode === 'token'
    ? { kind: 'token' as const, token: input.token ?? KEY_PLACEHOLDER }
    : input.pairing
      ? { kind: 'code' as const, code: input.pairing.code, expiresAt: input.pairing.expiresAt }
      : { kind: 'token' as const, token: KEY_PLACEHOLDER }
  return connectPrompt({
    origin: input.origin,
    tokenName: input.name,
    boards: input.reach.boards,
    allBoards: input.reach.allBoards,
    replacing: true,
    access,
    afterAdd: 'The new server is not live in this session yet, so its tools do not load here. When the add has worked, tell me to start a new Claude Code session (or to run /mcp reconnect in this one). Claude Code reads TASKMANAGER_API_KEY from the shell that starts it, so the new session must start from a shell where that variable is set (the export above, in the same shell); otherwise the server answers 401. Once the new session is up, ask me which board you should work on, and use only the tools of the new server.'
  })
}
