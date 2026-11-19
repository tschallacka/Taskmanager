// Is claude at its input line on this screen? (card mwnxqqj45nne9ye7l3k, Nina's should on d895d08). The input line is the
// "❯" row that sits between the two rules of the input box: a rule above it and a rule below it. A transcript line that starts
// with "❯" (a message the person sent) or with ">" has no rules around it, so it does not count. A dialog also ends the wait
// (crew/modal-detect.mjs): the caller checks the dialog next and holds on it, with PERSON-DIALOG, not a missing prompt.
// Run as a script: read the screen from stdin, exit 0 when the input line or a dialog shows, 1 when neither does.
import { pathToFileURL } from 'node:url'
import { findDialog } from './modal-detect.mjs'

const RULE = /^\s*─{3,}/
const INPUT = /^\s*❯(\s|$)/

/** True when the input line of claude's input box is on the screen (one row of "❯" with a rule above and below). */
export function hasInputLine(screen) {
  const rows = String(screen ?? '').split('\n')
  for (let i = 1; i < rows.length - 1; i += 1) {
    if (INPUT.test(rows[i]) && RULE.test(rows[i - 1]) && RULE.test(rows[i + 1])) return true
  }
  return false
}

/** True when the screen is ready to read as idle: the input line shows, or a dialog does (and is held on after). */
export function readyScreen(screen) {
  return hasInputLine(screen) || findDialog(screen) !== null
}

// The path is encoded as a file URL: a path with a space (or any other character a URL escapes) would never match the raw
// `file://` string, the main block would not run, and every screen would read as ready.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let text = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    text += chunk
  })
  process.stdin.on('end', () => {
    process.exit(readyScreen(text) ? 0 : 1)
  })
}
