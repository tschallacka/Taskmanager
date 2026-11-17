// The Pia watch's check for a dialog in Pia's terminal (card mwgc3f99m1u45ut1o0j). The watch reads her screen with
// interactive-shell (`sh pia-term.sh view 1-60`) and pipes the text here:
//   sh pia-term.sh view 1-60 | node crew/pia-modal-check.mjs
// It prints `PIA-MODAL <first line>` (exit 0) when a dialog shows, or `NO-PIA-MODAL` (exit 1) when none does. It reads only:
// it never types, presses or moves anything. Boss decides what to do; the recipe in PROMPTS says ESC, never Enter.
//
// The screen is read once by the watch. A dialog that shows after that read is not seen until the next read.
import { fileURLToPath } from 'node:url'
import { findDialog } from './modal-detect.mjs'

/** The line for the watch: `PIA-MODAL <first line>`, or null when no dialog shows. */
export function piaModalLine(screen) {
  const found = findDialog(screen)
  return found ? `PIA-MODAL ${found.first}` : null
}

// Run as a script: the screen comes in on stdin.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let text = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    text += chunk
  })
  process.stdin.on('end', () => {
    const line = piaModalLine(text)
    if (line) {
      console.log(line)
      process.exit(0)
    }
    console.log('NO-PIA-MODAL')
    process.exit(1)
  })
}
