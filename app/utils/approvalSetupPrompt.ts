// The setup prompt that carries NO token (card mwdd5q94mmq78py1ntp): the agent starts a browser approval for the
// crews:manage permission on the chosen board, the owner approves the link in the browser, and the key arrives once from
// the poll. The key goes only into an environment variable of the setup command; it is never written into the prompt,
// a file, a log or a card.

export interface ApprovalSetupInput {
  /** The base URL of this Taskmanager, with no trailing slash. */
  origin: string
  /** The board the crew is made for: the real board the crew is bound to. */
  boardId: string
  boardName: string
}

/** One shell word: single quotes around it, and each single quote in it closed, escaped and reopened. */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

export function approvalSetupPrompt(input: ApprovalSetupInput): string {
  const { origin, boardId, boardName } = input
  const host = new URL(origin).host
  // The board name is free text from the board: JSON.stringify escapes it for the JSON body, and shellQuote keeps the
  // whole body one shell word, so a quote or an apostrophe in the name cannot break the command the agent runs.
  const startBody = shellQuote(JSON.stringify({ client_name: `Crew setup for ${boardName}`, boards: [{ boardId, scopes: ['crews:manage'] }] }))
  return `You set up one new crew for the Taskmanager board "${boardName}" (board id ${boardId}) at ${origin}.

There is no token in this prompt. You get a key by a browser approval: the owner of the board approves one request in the browser, and you receive the key once.

Ask the user one question only: the path of the repository the crew works on, if you do not know it.

Step 1: get the kit. Keep it in ~/crew-kit-${host}.
  Download it: curl -sSf -D - -o ~/crew-kit.tar.gz ${origin}/crew/kit.tar.gz
  If ~/crew-kit-${host} already holds the same version (the x-crew-kit-version header), reuse it.
  Otherwise: mkdir -p ~/crew-kit-${host} && tar -xzf ~/crew-kit.tar.gz -C ~/crew-kit-${host} && cd ~/crew-kit-${host} && npm install

Step 2: get the key by browser approval.
  a. Start the request: curl -s -X POST -H "content-type: application/json" "${origin}/api/pair/device" -d ${startBody}
     The answer holds device_code, user_code, verification_url and interval. Keep device_code in a shell variable only; never print it into a file.
  b. Show the user the verification_url and ask them to open it and approve. The request expires after 10 minutes.
  c. Poll every interval seconds until the answer is approved: curl -s -X POST -H "content-type: application/json" "${origin}/api/pair/device/poll" -d "{\\"device_code\\":\\"$DEVICE_CODE\\"}"
     Pending means wait. If it says expired or denied, start again from a and show the new link.
  d. When approved, the answer holds the key. Put it only in the environment variable TASKMANAGER_MANAGEMENT_TOKEN for the next command. Do not write it to a file, a log, a task or a chat.

Step 3: make the crew. In the kit folder, with the key in the environment only:
  cd ~/crew-kit-${host} && TASKMANAGER_MANAGEMENT_TOKEN="$KEY" node setup.mjs --origin ${origin} --board ${boardId} --repo <repository path>
  The crew is always new. If the command says the slug is taken, run it again with --slug <another slug>. Never rotate a crew.
  The crew gets its own home, ~/crew-<slug>. If that folder already holds creds.json, the command stops and changes nothing.

Step 4: report. The command prints three lines: the crew home, the work board's address, and what to do next. Tell the user those three lines, and nothing else from the output.

Rules:
- The key goes only into TASKMANAGER_MANAGEMENT_TOKEN for that one command. Never paste it into a file, a log, a task, a chat or another service.
- Do not open or print any file in the crew home, and print no key or password.
- A crew works only on its work board, the shadow board the command names. Never write to the real board, ${boardId}.
- If a call answers 403, tell the user the sentence in the reply, word for word, and stop.`
}
