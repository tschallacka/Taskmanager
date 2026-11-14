#!/usr/bin/env node
// Boss's watch on the two people who keep the crew moving: Pia and Susy. Every 3 minutes it checks, and prints one line
// only when something is wrong (and again when it is fixed), so a Monitor stays quiet while all is well:
//   crew watch-crew          the Monitor: run it with the Monitor tool, timeout 1800000 (30 minutes), and re-arm it
// Pia:  her Claude session runs, her transcript moved in the last 20 minutes, and listen.mjs pia runs under her session.
// Susy: `crew activity` shows her working, running or listening, and her last step is under 20 minutes old.
// A problem is confirmed by a second look 30 s later before it is printed (a listener changes hands between two of
// its runs, and a person can show "ended" for a moment between a reply and the next step).
import { pathToFileURL } from 'node:url'
import { activityRows, isPiaProcess, piaProjectsDir, readCmdlines } from './activity.mjs'

export const QUIET_MINUTES = 20
export const CHECK_SECONDS = 180
export const CONFIRM_SECONDS = 30

/**
 * The problems in one look at the rows: a string such as " pia-quiet-25min; susy-working-22min;", "" when all is well.
 * `rows` are activityRows() rows; `alive` says whether Pia's Claude process runs.
 */
export function problemsOf({ rows, alive }) {
  const pia = rows.find(r => r.key === 'pia')
  const susy = rows.find(r => r.key === 'susy')
  const out = []
  if (!alive || !pia || pia.state === 'gone') out.push('pia-session-gone')
  else {
    if (pia.mins >= QUIET_MINUTES) out.push(`pia-quiet-${pia.mins}min`)
    if (/NO own listener/.test(pia.what)) out.push('pia-no-listener-in-her-session')
  }
  if (!susy) out.push('susy-not-running')
  else if (['working', 'running', 'listening'].includes(susy.state)) {
    if (susy.mins >= QUIET_MINUTES) out.push(`susy-${susy.state}-${susy.mins}min`)
  } else out.push(`susy-${susy.state}-${susy.mins}min`)
  return out.length ? ` ${out.join('; ')};` : ''
}

/** Whether the problem list holds something that only a second look settles. */
export function isTransient(problems) {
  // Susy's state other than working, running or listening, or no Susy at all, is looked at again (as the shell watch did).
  return /pia-no-listener-in-her-session|susy-not-running|susy-(?!working|running|listening)[a-z]+-/.test(problems)
}

/** Reads the rows and Pia's process now. `root` is Pia's Claude folder; `readCmdlines` and `activityRows` are injectable. */
export function look({ root, hours = 6, now = Date.now(), cmdlines = readCmdlines() } = {}) {
  const alive = cmdlines.some(isPiaProcess)
  const rows = activityRows({ root, hours, now, cmdlines, alive })
  return problemsOf({ rows, alive })
}

/**
 * The loop. Prints one line when the problem list changes: "HH:MM PROBLEM: ..." or "HH:MM OK: Pia and Susy are working
 * again". `check()` returns a problem list; a transient list is checked once more after `confirmWait()`.
 */
export async function watchLoop({ check, print, wait, confirmWait, rounds = Infinity, clock = () => new Date() }) {
  let last = ''
  for (let round = 0; round < rounds; round++) {
    let problems = check()
    if (problems && isTransient(problems)) {
      await confirmWait()
      problems = check()
    }
    if (problems !== last) {
      const stamp = clock().toTimeString().slice(0, 5)
      if (problems) print(`${stamp} PROBLEM:${problems}`)
      else print(`${stamp} OK: Pia and Susy are working again`)
      last = problems
    }
    if (round + 1 < rounds) await wait()
  }
}

function main() {
  const crewHome = process.env.CREW_HOME ?? ''
  if (!crewHome) {
    console.error('crew watch-crew: CREW_HOME is not set (the folder that holds crew.json)')
    return 64
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const root = piaProjectsDir(crewHome)
  return watchLoop({
    check: () => look({ root }),
    print: text => console.log(text),
    wait: () => sleep(CHECK_SECONDS * 1000),
    confirmWait: () => sleep(CONFIRM_SECONDS * 1000)
  }).then(() => 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  Promise.resolve(main()).then((code) => {
    process.exitCode = code
  })
}
