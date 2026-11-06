// The opencode adapter of the crew runner: the command that runs one worker on one card, headless, on
// a provider/model pair (Ollama or OpenRouter, which opencode reaches through its provider config).
// Pure: it builds the arguments and the environment and reads the session back. The runner starts it.
//
// The flags are the ones `opencode run --help` lists (opencode 1.x): --model provider/model,
// --format json, --session, --title. The message is the last argument. No flag here approves a
// permission: what the worker may do comes from its own config (written by the config step).

export const NAME = 'opencode'

/** The argument list for one run. `model` is provider/model, as pinned in runner-models.json. */
export function args({ model, message, session = null, title = null }) {
  if (!model || !model.includes('/')) throw new Error('an opencode run needs a provider/model name')
  const out = ['run', '--model', model, '--format', 'json']
  if (session) out.push('--session', session)
  if (title) out.push('--title', title)
  out.push(message)
  return out
}

/** The environment for one run: the worker's own opencode config, and nothing else added. */
export function env({ configFile }) {
  return configFile ? { OPENCODE_CONFIG: configFile } : {}
}

/**
 * The session id from the JSON lines opencode prints with --format json: the first object that names
 * one. Null when the output names none, so the caller starts a new session next time.
 */
export function parseSession(output) {
  for (const line of String(output).split('\n')) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    let event
    try {
      event = JSON.parse(text)
    } catch {
      continue
    }
    const id = event.sessionID ?? event.sessionId ?? event.session_id ?? event.part?.sessionID
    if (typeof id === 'string' && id) return id
  }
  return null
}
