// The "Put an AI crew to work on this board" dialog: the copy-paste prompt an agent is given to manage the crew of one board, and
// the countdown of the 10 minutes the token lives. Pure, so the prompt is tested on its own.

export interface ManagementPromptInput {
  /** The base URL of this Taskmanager, with no trailing slash. */
  origin: string
  /** The board the crew is managed for: the real board the crew is bound to. */
  boardId: string
  boardName: string
  /** The management token, shown once. */
  token: string
  /** When the token stops working, in milliseconds since the epoch. */
  expiresAt: number
}

/** The copy-paste prompt for the agent. It carries the token once, in the Authorization header, and the crew calls. */
export function managementPrompt(input: ManagementPromptInput): string {
  const api = `${input.origin}/api`
  return `You put an AI crew to work on one Taskmanager board. The board is "${input.boardName}" (board id ${input.boardId}) at ${input.origin}.

Your management token is below. It works for 10 minutes, until ${new Date(input.expiresAt).toISOString()}, and then it stops. It works for this board only.
${input.token}

Send the token in one place only, the Authorization header of each call:
  Authorization: Bearer ${input.token}
Never paste it anywhere else: not into a file, a log, a task, a comment, a chat or another service.

The calls you may make, all on ${api}:
1. See the boards a crew can be bound to: GET ${api}/crews/targets
   The answer lists "teams", each with "userboards". Your board is the userboard with "board_id": "${input.boardId}".
2. Set up the AI crew for this board: POST ${api}/crews
   Send JSON: {"slug": "<short name, 2 to 63 characters, a to z, 0 to 9 and hyphens>", "name": "<crew name>", "product": {"name": "<product name>"}, "projectId": "${input.boardId}"}
   Every call makes a new crew. Keep the slug: it names the folder of the keys in step 3. If the slug is already taken the call answers 409: choose another slug and send the call again. Never add "rotate" to this call.
   The answer has the crew's "slug", its people (id, name, role, email and tag, no keys), "keys_url", "keys_note", and these boards, each with "board_id", "board_name" and "url":
   - "real_board": the board of the people. Do not write to it.
   - "shadow_board": the crew's work board. Give the crew this board's "url" as its work board.
   - "userboard": the real board with its shadow boards.
   The crew's own board, "crew.boardUrl", is not the work board. Do not give it to the crew, unless the owner decides otherwise.
   The answer holds no keys and no passwords. They come from the keys route in step 3, once.
3. Get the keys: POST the "keys_url" with the same token and no body. The answer is plain text: one export line per person and secret. Save it, once, to a file that only the user can read:
   - The folder is ~/.config/taskmanager/<slug>/ (mode 700) and the file in it is keys.env (mode 600), outside any repository. Make them with:
     umask 077; mkdir -p -m 700 ~/.config/taskmanager/<slug>; curl -s -f -X POST -H "Authorization: Bearer <token>" "<keys_url>" -o ~/.config/taskmanager/<slug>/keys.env
   - Never print the file, open it, read it back, or paste a key into a chat, a task, a log or a file of your own. Tell the user the path, and nothing else about the keys.
   - If keys.env already exists, do not overwrite it. Save the answer to a new name next to it (keys-2.env, keys-3.env, and so on) and tell the user that name.
   - Each name is TASKMANAGER_CREW_<SLUG>_<PERSON>_API_KEY or TASKMANAGER_CREW_<SLUG>_<PERSON>_PASSWORD, with the slug and the person upper-cased and dashes turned into underscores. The file loads into a shell with: . ~/.config/taskmanager/<slug>/keys.env
   - Every call to keys_url makes new keys, and the old ones stop working at once. Call it once, and again only when the file was lost.
4. Remove the AI crew from this board: DELETE ${api}/crews/<slug>
   The crew's shadow board is archived, and what the crew wrote on it is kept.

Rules:
- A crew works only on its shadow_board. Never write to the real board: no tasks, comments, columns or time logs on it.
- Never paste the token anywhere except the Authorization header.
- If a call answers 401 with the code token_expired, token_regenerated or token_revoked, stop. Do not retry with this token. Tell your main agent the message the reply gave, word for word, so they can ask the user for a new token.
- If a call answers 403, tell your main agent the sentence in the reply, word for word, and stop.
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
