// The copy-paste prompts for a crew's own token (card mwdd9d2vtgqhfr6izq): one job per prompt, and the token reaches only
// this crew's keys and people routes. The crew's home is ~/crew-<slug>; no prompt relies on CREW_HOME.

export type CrewJob = 'recover' | 'people'

export interface CrewManageInput {
  origin: string
  /** The crew's slug: it names the home (~/crew-<slug>) and the routes. */
  slug: string
  boardName: string
  token: string
  expiresAt: number
  job: CrewJob
}

/** One job's prompt, the token in it once. */
export function crewManagePrompt(input: CrewManageInput): string {
  const { origin, slug, boardName, token } = input
  const home = `~/crew-${slug}`
  const until = new Date(input.expiresAt).toISOString()
  const head = `You manage the crew "${slug}" that works on the Taskmanager board "${boardName}" at ${origin}.

Your token works for 10 minutes, until ${until}, and reaches only this crew's keys and people routes. It is shown once:
${token}

Send the token in the Authorization header of each call and nowhere else. Never print or paste a key or password.`
  if (input.job === 'recover') {
    return `${head}

Job: recover the keys. The crew's creds.json was lost or overwritten. The old keys stop working as soon as new ones are made.

Step 1: fetch the keys as JSON into the crew home, mode 600, in one call:
  mkdir -p -m 700 ${home} && umask 077 && curl -s -f -X POST -H "Authorization: Bearer <token>" "${origin}/api/crews/${slug}/keys?format=json" -o ${home}/creds.json
Step 2: report that ${home}/creds.json is written. Do not open it or print it.`
  }
  return `${head}

Job: add the missing people. A person the crew lacks gets an account and a key; nobody else is touched.

Step 1: call the people route once, with no body (it adds every missing person of the kit):
  curl -s -f -X POST -H "Authorization: Bearer <token>" "${origin}/api/crews/${slug}/people" -o ${home}/people.json
Step 2: merge only the new keys into ${home}/creds.json (mode 600), keeping every existing entry. Do not print the keys.
Step 3: report the names of the people added, and nothing else.`
}
