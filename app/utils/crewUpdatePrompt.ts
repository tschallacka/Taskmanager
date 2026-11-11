// "Update this crew's kit": the fire-and-forget prompt for a model that runs a crew. It needs no token,
// because the kit is public. The one line is the same one the instance serves at /crew/update.sh: it comes from
// #shared/utils/crewUpdate, the one place the command is written.
import { crewUpdateCommand } from '#shared/utils/crewUpdate'

/** The prompt pasted into the agent's session: run the line, then report the block it prints. */
export function crewUpdatePrompt(origin: string): string {
  return `Update this crew's kit to ${origin}.

Run this one line, with the crew home folder of this crew (the folder that holds crew.json) in place of <crew home>:

    ${crewUpdateCommand(origin)}

It is not interactive. Never print or copy creds.json or any key.
When it finishes, report the lines it printed for the crew update (the "crew update:" lines and the last line), as they are, plus any CONFLICT or FAIL line above them.
Then tell me to restart my Boss session.`
}
