// The "Put an AI crew to work on this board" dialog: the copy-paste prompt an agent is given to make one new crew for one board, and
// the countdown of the 10 minutes the token lives. Pure, so the prompt is tested on its own.

export interface ManagementPromptInput {
  /** The base URL of this Taskmanager, with no trailing slash. */
  origin: string
  /** The board the crew is made for: the real board the crew is bound to. */
  boardId: string
  boardName: string
  /** The management token, shown once. */
  token: string
  /** When the token stops working, in milliseconds since the epoch. */
  expiresAt: number
}

/**
 * The copy-paste prompt for the agent: three steps, one command. The kit comes from this instance, the kit's `setup.mjs`
 * makes the crew with the token in the environment, and the agent reports the three lines the command prints.
 */
export function managementPrompt(input: ManagementPromptInput): string {
  const { origin, boardId, token } = input
  return `You put an AI crew to work on one Taskmanager board. The board is "${input.boardName}" (board id ${boardId}) at ${origin}.

Your management token works for 10 minutes, until ${new Date(input.expiresAt).toISOString()}, and then it stops. It works for this board only. The token, shown once:
${token}

Do the three steps in order. Ask the user one question only: the path of the repository the crew works on, if you do not know it.

Step 1: get the kit. Keep it in ~/crew-kit-<host>, where <host> is the host name of ${origin}.
  Download it: curl -sSf -D - -o ~/crew-kit.tar.gz ${origin}/crew/kit.tar.gz
  If ~/crew-kit-<host> already holds the same version (the x-crew-kit-version header), reuse it.
  Otherwise: mkdir -p ~/crew-kit-<host> && tar -xzf ~/crew-kit.tar.gz -C ~/crew-kit-<host> && cd ~/crew-kit-<host> && npm install

Step 2: make the crew. In the kit folder, run the setup with the token in the environment variable only:
  cd ~/crew-kit-<host> && TASKMANAGER_MANAGEMENT_TOKEN=<token> node setup.mjs --origin ${origin} --board ${boardId} --repo <repository path>
  The crew is always new. If the command says the slug is taken, run it again with --slug <another slug>. Never rotate a crew.
  The crew gets its own home, ~/crew-<slug> (the slug the command makes, or the one you passed with --slug). Do not set CREW_HOME, and do not use any other folder. If that folder already holds creds.json, the command stops and changes nothing: use another --slug.

Step 3: report. The command prints three lines: the crew home, the work board's address, and what to do next. Tell the user those three lines, and nothing else from the output.

Rules:
- The token goes only in the TASKMANAGER_MANAGEMENT_TOKEN variable of that command. Never paste it into a file, a log, a task, a chat or another service.
- Do not open or print any file in the crew home, and print no key or password. The keys are written by the command itself, to creds.json.
- A crew works only on its work board, the shadow board the command names. Never write to the real board, ${boardId}.
- A remote call to the crew API needs this management token. A crews:manage key does not work here.
- If a call answers 401 with the code token_expired, token_regenerated or token_revoked, stop. Do not retry with this token. Tell the user the message the reply gave, word for word, so they can ask for a new token.
- If a call answers 403, tell the user the sentence in the reply, word for word, and stop.
- A management token reaches only this board. Any other board or crew is refused or answers 404.`
}

/** The time left on the token as m:ss, for the countdown. Zero or less reads as 0:00. */
export function countdownText(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** The sentences the crew permission gives for a team and for a board (crewPermission.ts, CREW_SENTENCES). */
export const TEAM_CREW_SENTENCE = 'The owner or admin of this team has not allowed crews for this team.'
export const BOARD_CREW_SENTENCE = 'The owner or admin of this board has not allowed crews for this board.'

/** Where the owner or admin switches a crew level on, for a refusal that names one. Null for any other sentence. */
export function refusalLink(message: string, boardId: string): { label: string, to: string } | null {
  if (message === TEAM_CREW_SENTENCE) return { label: 'Open the team\'s crew settings', to: '/team?section=crews' }
  if (message === BOARD_CREW_SENTENCE) return { label: 'Open the board\'s settings', to: `/projects/${boardId}?view=settings` }
  return null
}
