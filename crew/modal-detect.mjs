// A dialog on a session's screen (crew/modal-detect.mjs): Claude Code can stop on a question such as "Teach auto mode about
// your environment?" and wait for a key. Nothing types into such a session until the dialog is gone. This module reads the
// screen text of one session (as interactive-shell `view` returns it) and says whether a dialog is showing. It does not type,
// press or move anything. The caller decides: the Pia watch and the wake sender mail Boss PERSON-DIALOG with the first line.
//
// A dialog is a line that starts with a question mark, with a footer below it that says how to answer: "Enter to continue",
// "Enter to confirm", or "Esc to cancel". A question in prose or in the transcript has no footer, so it does not count.

const QUESTION = /^\s*[│|]?\s*\?\s*\S/
const FOOTER = /(enter to (continue|confirm)|esc to cancel)/i
const LOOK_BELOW = 6
const FIRST_LINE_MAX = 200

/**
 * @param {string} screen the screen text, one row per line
 * @returns {{ first: string } | null} the dialog's first line, or null when no dialog shows
 */
export function findDialog(screen) {
  const rows = String(screen ?? '').split('\n')
  for (let i = 0; i < rows.length; i += 1) {
    if (!QUESTION.test(rows[i])) continue
    const below = rows.slice(i + 1, i + 1 + LOOK_BELOW)
    if (below.some(row => FOOTER.test(row))) {
      const first = rows[i].replace(/^\s*[│|]?\s*/, '').replace(/\s*[│|]?\s*$/, '')
      return { first: first.length > FIRST_LINE_MAX ? `${first.slice(0, FIRST_LINE_MAX - 1)}…` : first }
    }
  }
  return null
}

/** The mail line for Boss: `PERSON-DIALOG <who>: <first line>`, or null when the screen shows no dialog. */
export function dialogMail(who, screen) {
  const found = findDialog(screen)
  return found ? `PERSON-DIALOG ${who}: ${found.first}` : null
}

// Run as a script: read the screen from stdin, print the mail line (exit 0) or NO-DIALOG (exit 1).
if (import.meta.url === `file://${process.argv[1]}`) {
  let text = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    text += chunk
  })
  process.stdin.on('end', () => {
    const who = process.argv[2] || 'session'
    const mail = dialogMail(who, text)
    if (mail) {
      console.log(mail)
      process.exit(0)
    }
    console.log('NO-DIALOG')
    process.exit(1)
  })
}
