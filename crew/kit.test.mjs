// Tests for the crew kit: the shipped file list, and the `crew <who> browser` command end to end.
// Run from the repo root: node --test crew/kit.test.mjs
//
// The list tests need nothing. The command tests start the driver and a real Chromium when one is
// found (CREW_BROWSER_CHROMIUM, CHROMIUM, or chromium in crew.json); otherwise they skip and say why.
// They use a throwaway CREW_HOME with its own crew.json and creds.json, a fake board on 127.0.0.1
// (sign-in, the team step, one page) and a scratch state folder. They never touch the real crew folder.
//
// Not shipped, so kit-files.txt must not list them: tests (*.test.mjs), dotfiles, kit-files.txt itself,
// and anything that holds a login or a run (creds.json, crew.json, crew.config.json, logs, profiles).

import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { findChromium, request, serve } from './browser-driver.mjs'
import { boardOrigin, signIn } from './browser.mjs'
import { crewHome } from './home.mjs'
import { formatIdle, parseActivity } from './idle.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const CREW = join(KIT, 'crew.mjs')
const DRIVER = join(KIT, 'browser-driver.mjs')
const NOT_SHIPPED = /\.test\.mjs$|^\.|^kit-files\.txt$/
const SECRET_OR_RUN = /^(creds|crew|crew\.config|package-lock)\.json$|\.log$/

describe('the kit file list', () => {
  const listed = readFileSync(join(KIT, 'kit-files.txt'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  test('every listed file exists, once, and the list is sorted', () => {
    assert.deepEqual(listed, [...new Set(listed)], 'no duplicates')
    assert.deepEqual(listed, [...listed].sort(), 'keep it sorted')
    for (const name of listed) assert.ok(existsSync(join(KIT, name)), `${name} is listed but missing`)
  })

  test('no excluded file is listed: tests, dotfiles, the list itself, logins and runs', () => {
    for (const name of listed) {
      assert.ok(!NOT_SHIPPED.test(name), `${name} must not ship`)
      assert.ok(!SECRET_OR_RUN.test(name), `${name} must not ship`)
    }
  })

  test('every shipped-shape file in the kit folder is listed', () => {
    const shape = /\.(mjs|md|tmpl|json|sh)$/
    const present = readdirSync(KIT).filter((name) => {
      const path = join(KIT, name)
      return statSync(path).isFile() && shape.test(name) && !NOT_SHIPPED.test(name) && !SECRET_OR_RUN.test(name)
    })
    assert.deepEqual(present.filter(name => !listed.includes(name)), [], 'add these to kit-files.txt, or name why they do not ship')
  })
})

// ---------- the command, against a fake board and a real Chromium ----------

const CHROMIUM = findChromium()
const SKIP = CHROMIUM ? false : 'no Chromium found (set CREW_BROWSER_CHROMIUM or CHROMIUM, or chromium in crew.json)'
if (SKIP) console.log(`# command tests skipped: ${SKIP}`)

const SCRATCH = resolve(process.env.CREW_BROWSER_TEST_TMP || tmpdir())
const made = []
const PASSWORDS = { w1: `pw-${randomBytes(6).toString('hex')}`, w2: `pw-${randomBytes(6).toString('hex')}` }
const WRONG = `wrong-${randomBytes(6).toString('hex')}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitUntil(check, ms, what) {
  const until = Date.now() + ms
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`)
    await sleep(200)
  }
}

// A fake board: sign-in checks the password, sets a session cookie, and serves one page.
function startBoard() {
  const sessions = new Set()
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://board.test')
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (url.pathname === '/api/auth/get-session') {
        res.setHeader('content-type', 'application/json')
        return res.end('null')
      }
      if (url.pathname === '/api/auth/sign-in/email' && req.method === 'POST') {
        server.signIns = (server.signIns ?? 0) + 1
        const { email, password } = JSON.parse(raw || '{}')
        const who = Object.keys(PASSWORDS).find(name => email === `${name}@crew.test`)
        if (!who || password !== PASSWORDS[who]) {
          res.statusCode = 401
          return res.end('{}')
        }
        const sid = randomBytes(12).toString('hex')
        sessions.add(sid)
        res.setHeader('set-cookie', `sid=${sid}; Path=/; SameSite=Lax`)
        res.setHeader('content-type', 'application/json')
        return res.end('{"ok":true}')
      }
      if (url.pathname === '/api/auth/organization/set-active') return res.end('{}')
      if (url.pathname === '/check') {
        // The board's own check: the title says whether this request carries a session it issued.
        const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
        res.setHeader('content-type', 'text/html')
        return res.end(`<!doctype html><title>${sessions.has(sid) ? 'session' : 'no session'}</title><p>check</p>`)
      }
      if (url.pathname === '/page') {
        res.setHeader('content-type', 'text/html')
        return res.end('<!doctype html><title>Kit page</title><p>hello from the fake board</p>')
      }
      res.statusCode = 404
      res.end('')
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** Runs `crew ...` with this test's home and state folder. Resolves { code, stdout, stderr }. */
function crew(env, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CREW, ...args], { env, timeout: 150000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

describe('crew <who> browser, end to end (real Chromium, fake board)', { skip: SKIP }, () => {
  let board
  let base
  let home
  let env
  let dir

  test('setup: a fake board, a crew folder with a login for wren and wick and a wrong one for wynn', async () => {
    board = await startBoard()
    base = `http://127.0.0.1:${board.address().port}`
    home = mkdtempSync(join(SCRATCH, 'kit-'))
    made.push(home)
    dir = join(home, 'work', 'browser')
    mkdirSync(join(home, 'work'), { recursive: true })
    writeFileSync(join(home, 'crew.json'), JSON.stringify({ team: 'Test Crew', chromium: CHROMIUM, product: { name: 'Test', repo: '', appUrl: base } }))
    writeFileSync(join(home, 'creds.json'), JSON.stringify({
      base,
      team: { id: 'team-1' },
      people: {
        wren: { email: 'w1@crew.test', password: PASSWORDS.w1, apiKey: 'not-used-here' },
        wick: { email: 'w2@crew.test', password: PASSWORDS.w2, apiKey: 'not-used-here' },
        wynn: { email: 'w3@crew.test', password: WRONG, apiKey: 'not-used-here' }
      }
    }))
    env = { ...process.env, CREW_HOME: home, CREW_BROWSER_DIR: dir, CREW_BROWSER_CHROMIUM: CHROMIUM }
    delete env.CREW_BROWSER_SHOT_DIRS
    if (process.env.CREW_CHROMIUM_NO_SANDBOX === '1') env.CREW_CHROMIUM_NO_SANDBOX = '1'
  })

  test('the first command starts the browser, logs the person in, and prints the page', async () => {
    const out = await crew(env, ['wren', 'browser', 'goto', `${base}/page`])
    assert.equal(out.code, 0, out.stderr)
    assert.equal(out.stdout, `${base}/page - Kit page`)
    const check = await crew(env, ['wren', 'browser', 'goto', `${base}/check`])
    assert.equal(check.code, 0, check.stderr)
    const title = await crew(env, ['wren', 'browser', 'eval', 'document.title'])
    assert.equal(title.stdout, 'session', 'w1 is signed in, as the board sees it')
    assert.equal(check.stdout, `${base}/check - session`)
    const tabs = await crew(env, ['wren', 'browser', 'tabs'])
    assert.equal(JSON.parse(tabs.stdout).includes('main'), true)
  })

  test('another person on the same origin has a login of their own', async () => {
    const w1 = await crew(env, ['wren', 'browser', 'eval', 'document.title'])
    const w2 = await crew(env, ['wick', 'browser', 'goto', `${base}/check`])
    assert.equal(w2.code, 0, w2.stderr)
    const w2title = await crew(env, ['wick', 'browser', 'eval', 'document.title'])
    assert.equal(w2title.stdout, 'session', 'w2 is signed in, as the board sees it')
    assert.equal(w1.stdout, 'session', 'w1 keeps her own login')
  })

  test('a failed sign-in is one line, and no password appears in it', async () => {
    const out = await crew(env, ['wynn', 'browser', 'goto', `${base}/page`])
    assert.equal(out.code, 1)
    assert.equal(out.stderr, 'could not sign in as wynn (HTTP 401)')
    assert.ok(!out.stderr.includes(WRONG) && !out.stdout.includes(WRONG))
  })

  test('a person with no login in creds.json is refused in plain words', async () => {
    const out = await crew(env, ['w9', 'browser', 'goto', `${base}/page`])
    assert.equal(out.code, 1)
    assert.equal(out.stderr, 'w9 has no login in creds.json')
  })

  test('status shows people, tabs and idle seconds, and never a cookie', async () => {
    const out = await crew(env, ['browser', 'status'])
    assert.equal(out.code, 0, out.stderr)
    const people = JSON.parse(out.stdout)
    const w1 = people.find(person => person.who === 'wren')
    assert.ok(w1, 'w1 is listed')
    assert.ok(w1.tabs.includes('main'))
    assert.equal(typeof w1.idle_seconds, 'number')
    assert.ok(!out.stdout.includes('sid='), 'no cookie in status')
    assert.ok(!out.stdout.includes(PASSWORDS.w1), 'no password in status')
  })

  test('shot writes a PNG under the work folder, and refuses a file outside it', async () => {
    const inside = join(home, 'work', 'kit-check.png')
    const out = await crew(env, ['wren', 'browser', 'shot', inside])
    assert.equal(out.code, 0, out.stderr)
    const head = readFileSync(inside).subarray(0, 8)
    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const outside = await crew(env, ['wren', 'browser', 'shot', join(home, '..', 'elsewhere.png')])
    assert.equal(outside.code, 1)
    assert.match(outside.stderr, /outside the allowed folders/)
  })

  test('after a browser crash the next command starts a new browser, logs the person in again, and says so', async () => {
    const log = readFileSync(join(dir, 'pool.log'), 'utf8')
    const pids = [...log.matchAll(/chromium pid (\d+)/g)].map(match => Number(match[1]))
    const pid = pids[pids.length - 1]
    assert.ok(pid, 'the driver logged its Chromium pid')
    process.kill(pid, 'SIGKILL')
    const until = Date.now() + 20000
    while (!readFileSync(join(dir, 'pool.log'), 'utf8').includes('browser stopped')) {
      if (Date.now() > until) assert.fail('the driver noticed the crash')
      await sleep(200)
    }
    const out = await crew(env, ['wren', 'browser', 'goto', `${base}/check`])
    assert.equal(out.code, 0, out.stderr)
    assert.equal(out.stdout, `${base}/check - session`, 'signed in again')
    assert.match(out.stderr, /note: the shared browser stopped and was started again/)
    assert.match(out.stderr, /login was set up again/)
  })

  test('done forgets the person, and shutdown stops the browser for everyone', async () => {
    const done = await crew(env, ['wick', 'browser', 'done'])
    assert.equal(done.stdout, 'done')
    const down = await crew(env, ['browser', 'shutdown'])
    assert.equal(down.code, 0, down.stderr)
    const until = Date.now() + 20000
    for (;;) {
      const status = await crew(env, ['browser', 'status'])
      if (status.stdout === '[]') break // nothing running: nobody listed
      if (Date.now() > until) assert.fail('the browser did not stop')
      await sleep(300)
    }
  })

  after(async () => {
    if (env) await crew(env, ['browser', 'shutdown']).catch(() => {})
    if (board) await new Promise(resolve => board.close(resolve))
  })
})

describe('the board address and where a password may go', () => {
  test('https is accepted; plain http only to this machine', () => {
    assert.equal(boardOrigin('https://board.example.com/'), 'https://board.example.com')
    assert.equal(boardOrigin('http://localhost:3000'), 'http://localhost:3000')
    assert.equal(boardOrigin('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000')
    assert.equal(boardOrigin('http://[::1]:3000'), 'http://[::1]:3000')
    assert.throws(() => boardOrigin('http://board.example.com'), /must be https, or http on localhost, 127\.0\.0\.1 or \[::1\]$/)
    assert.throws(() => boardOrigin('ftp://localhost'), /must be https/)
    assert.throws(() => boardOrigin('not a url'), /not a URL/)
  })

  test('a CREW_BROWSER_PREPARE value in the environment is ignored: its module is never loaded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-env-'))
    made.push(dir)
    const marker = join(dir, 'imported')
    const module = join(dir, 'seam.mjs')
    writeFileSync(module, `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'loaded')\nexport const prepare = async () => {}\n`)
    spawnSync(process.execPath, [DRIVER, '_daemon'], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CREW_HOME: dir,
        CREW_BROWSER_DIR: dir,
        CREW_BROWSER_CHROMIUM: join(dir, 'no-such-chromium'),
        CREW_BROWSER_PREPARE: module
      },
      timeout: 30000
    })
    assert.equal(existsSync(marker), false, 'the environment cannot point the daemon at another seam')
  })
})

describe('a password goes only to the board', { skip: SKIP }, () => {
  test('the password goes only to the board, whatever page is open: the other site sees none', async () => {
    const board = await startBoard()
    const other = await startBoard()
    const dir = mkdtempSync(join(SCRATCH, 'kit-origin-'))
    made.push(dir)
    const boardBase = `http://127.0.0.1:${board.address().port}`
    const otherBase = `http://127.0.0.1:${other.address().port}`
    const creds = { base: boardBase, team: { id: 'team-1' }, people: { wren: { email: 'w1@crew.test', password: PASSWORDS.w1 } } }
    const running = serve({
      dir,
      chromium: CHROMIUM,
      signals: false,
      prepare: async (who, call, session) => {
        // The page is on another site when the sign-in runs: the password still goes only to the board.
        await call('goto', { url: `${otherBase}/page` })
        await signIn(who, session, creds)
      }
    })
    try {
      await waitUntil(async () => (await request({ dir, cmd: 'status', start: false, seam: false })) !== null, 20000, 'the in-process driver')
      const went = await request({ dir, who: 'wren', cmd: 'goto', args: { url: `${boardBase}/page` }, start: false, seam: false })
      assert.equal(went.result, `${boardBase}/page - Kit page`)
      assert.equal(board.signIns, 1, 'the board saw the one sign-in')
      assert.equal(other.signIns ?? 0, 0, 'the other site saw no sign-in')
    } finally {
      await request({ dir, cmd: 'shutdown', start: false, seam: false }).catch(() => null)
      await running.catch(() => {})
      await new Promise(resolve => board.close(resolve))
      await new Promise(resolve => other.close(resolve))
    }
  })
})

describe('CREW_HOME and the agent types', () => {
  // A launcher that sets CREW_HOME without a shell passes "~/..." on as it is.
  test('a leading ~ is the home folder; anything else resolves as a path', () => {
    assert.equal(crewHome('~'), homedir())
    assert.equal(crewHome('~/crew-home/acme'), join(homedir(), 'crew-home/acme'))
    assert.equal(crewHome('/srv/crew'), '/srv/crew')
    assert.equal(crewHome('crew'), resolve('crew'))
    assert.equal(crewHome(''), KIT)
  })

  // HOME is a scratch folder, so ~ and ~/.claude/agents land there and never in the real ones.
  function crewIn(home) {
    const dir = join(home, 'crew-home', 'acme')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'crew.json'), JSON.stringify({ team: 'Acme Crew', crew: { slug: 'acme' }, board: { url: 'http://127.0.0.1:9' } }))
    return dir
  }
  const run = (home, script, crewHomeValue, ...args) => spawnSync(process.execPath, [join(KIT, script), ...args], {
    cwd: home, // not the kit folder, so a relative reading of "~/..." would land under it
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', CREW_HOME: crewHomeValue }
  })

  test('a wrong CREW_HOME is named as given and as resolved', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const out = run(home, 'watch.mjs', '~/crew-home/nope')
    assert.equal(out.status, 78)
    assert.match(out.stderr, /CREW_HOME is "~\/crew-home\/nope", which resolves to \S+\/crew-home\/nope\./)
  })

  test('init writes one Haiku agent definition per member, named for the crew, and PROMPTS.md names them', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    run(home, 'init.mjs', '~/crew-home/acme')
    const agents = join(home, '.claude', 'agents')
    assert.deepEqual(readdirSync(agents).sort(), [
      'acme-log-watcher.md', 'acme-nina-nitpick.md', 'acme-pia-planner.md', 'acme-quincy-average.md', 'acme-usher-xander.md',
      'acme-wade-worker.md', 'acme-wick-worker.md', 'acme-wren-worker.md', 'acme-wynn-worker.md'
    ])
    const pia = readFileSync(join(agents, 'acme-pia-planner.md'), 'utf8')
    assert.match(pia, /^---\nname: acme-pia-planner\ndescription: ".+"\nmodel: haiku\n---\n/)
    assert.ok(pia.includes(`CREW_HOME=${dir} node ${KIT}/`), 'the definition carries the resolved CREW_HOME')
    const prompts = readFileSync(join(dir, 'PROMPTS.md'), 'utf8')
    assert.match(prompts, /\| `wren` \| Wren Worker \| wren \| `acme-wren-worker` \| claude: haiku \|/)
    assert.ok(prompts.includes(`CREW_HOME=${dir} node ${KIT}/listen.mjs pia 60`), 'commands carry CREW_HOME')
  })

  test('crew.json models set the model per person; another provider gets no agent definition and a warning', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    writeFileSync(join(dir, 'crew.json'), JSON.stringify({
      team: 'Acme Crew',
      crew: { slug: 'acme' },
      board: { url: 'http://127.0.0.1:9' },
      models: { default: 'haiku', usher: 'sonnet', wick: { provider: 'ollama', model: 'small-local' }, pm: { model: 'opus' } }
    }))
    const out = run(home, 'init.mjs', '~/crew-home/acme')
    const agents = join(home, '.claude', 'agents')
    assert.match(readFileSync(join(agents, 'acme-usher-xander.md'), 'utf8'), /\nmodel: sonnet\n/)
    assert.match(readFileSync(join(agents, 'acme-wren-worker.md'), 'utf8'), /\nmodel: haiku\n/)
    assert.match(readFileSync(join(agents, 'acme-pia-planner.md'), 'utf8'), /\nmodel: opus\n/, 'an old key in models is read as the new one')
    assert.ok(!readdirSync(agents).includes('acme-wick-worker.md'), 'no definition for a provider the kit does not start')
    assert.match(out.stdout, /WARN acme-wick-worker is set to ollama \(small-local\)/)
    const prompts = readFileSync(join(dir, 'PROMPTS.md'), 'utf8')
    assert.match(prompts, /\| `usher` \| Usher Xander \| usher \| `acme-usher-xander` \| claude: sonnet \|/)
    assert.match(prompts, /\| `wick` \| Wick Worker \| wick \| `acme-wick-worker` \| ollama: small-local \|/)
    assert.ok(prompts.includes('claude --model opus --add-dir'), 'Pia starts on her own model')
  })

  test('a mistake in models is a FAIL line, and that person gets the default', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    writeFileSync(join(dir, 'crew.json'), JSON.stringify({
      team: 'Acme Crew',
      crew: { slug: 'acme' },
      board: { url: 'http://127.0.0.1:9' },
      models: { wren: { provider: 'nope' }, quincy: 'has space', usher: 42 }
    }))
    const out = run(home, 'init.mjs', '~/crew-home/acme')
    assert.match(out.stdout, /FAIL crew\.json: models\.wren: the provider "nope" is not one of claude, openrouter, ollama/)
    assert.match(out.stdout, /FAIL crew\.json: models\.quincy: the model must be a name/)
    assert.match(out.stdout, /FAIL crew\.json: models\.usher must be a model name or/)
    assert.equal(out.status, 1)
    const agents = join(home, '.claude', 'agents')
    for (const file of ['acme-wren-worker.md', 'acme-quincy-average.md', 'acme-usher-xander.md']) {
      assert.match(readFileSync(join(agents, file), 'utf8'), /\nmodel: haiku\n/, file)
    }
  })

  test('init never overwrites a definition it did not write', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    crewIn(home)
    const agents = join(home, '.claude', 'agents')
    mkdirSync(agents, { recursive: true })
    writeFileSync(join(agents, 'acme-wren-worker.md'), 'mine\n')
    const out = run(home, 'init.mjs', '~/crew-home/acme')
    assert.equal(readFileSync(join(agents, 'acme-wren-worker.md'), 'utf8'), 'mine\n')
    assert.match(out.stdout, /FAIL \S+acme-wren-worker\.md exists and was not written by init/)
    assert.equal(out.status, 1)
  })

  // What the board hands over under "Fork the crew for this board".
  const forkFile = {
    base: 'http://127.0.0.1:9',
    crew: { slug: 'acme', name: 'Acme Crew' },
    board: { id: 'b1', name: 'Internal Tools' },
    members: [
      { key: 'wren', name: 'Wren Worker (Internal Tools)', agentType: 'internal-tools-wren', email: 'acme-f1-wren@crew.invalid', password: 'pw-one', apiKey: 'arn_forkone' },
      { key: 'pia', name: 'Pia Planner (Internal Tools)', agentType: 'internal-tools-pia', email: 'acme-f1-pia@crew.invalid', password: 'pw-two', apiKey: 'arn_forktwo' }
    ]
  }

  test('init --forks stores the file privately and writes one agent type per fork, named for the board', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    const source = join(home, 'forks-acme-internal-tools.json')
    writeFileSync(source, JSON.stringify(forkFile))
    const out = run(home, 'init.mjs', '~/crew-home/acme', '--forks', source)
    assert.match(out.stdout, /ok\s+internal-tools-wren\s+\(Internal Tools\)/)
    const stored = join(dir, 'forks', 'forks-acme-internal-tools.json')
    assert.equal(statSync(stored).mode & 0o777, 0o600, 'the file holds passwords and keys: owner only')
    const wren = readFileSync(join(home, '.claude', 'agents', 'internal-tools-wren.md'), 'utf8')
    assert.match(wren, /^---\nname: internal-tools-wren\ndescription: ".+Internal Tools.+"\nmodel: haiku\n---\n/)
    assert.ok(wren.includes('crew.mjs internal-tools-wren'), 'the definition tells the agent to sign in as itself')
    assert.ok(!wren.includes('arn_forkone') && !wren.includes('pw-one'), 'no secret goes into an agent definition')
    // The crew's own members are written as before, next to the forks.
    assert.ok(readdirSync(join(home, '.claude', 'agents')).includes('acme-wren-worker.md'))
  })

  test('a file that is not a forks file is refused and stored nowhere', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    const source = join(home, 'nope.json')
    writeFileSync(source, JSON.stringify({ members: [{ key: 'wren' }] }))
    const out = run(home, 'init.mjs', '~/crew-home/acme', '--forks', source)
    assert.match(out.stdout, /FAIL .+nope\.json: it is not a forks file/)
    assert.ok(!existsSync(join(dir, 'forks', 'nope.json')))
  })

  test('a fork signs in as its agent type: creds gain it as a person, the crew keys stay', () => {
    const home = mkdtempSync(join(SCRATCH, 'kit-home-'))
    made.push(home)
    const dir = crewIn(home)
    mkdirSync(join(dir, 'forks'), { recursive: true })
    writeFileSync(join(dir, 'forks', 'one.json'), JSON.stringify(forkFile))
    writeFileSync(join(dir, 'forks', 'broken.json'), '{ not json')
    writeFileSync(join(dir, 'creds.json'), JSON.stringify({ base: 'http://127.0.0.1:9', people: { wren: { email: 'w1@crew.test', password: 'p', apiKey: 'arn_crewkey' } } }))
    const script = `import('${join(KIT, 'config.mjs')}').then(m => console.log(JSON.stringify({ people: m.loadCreds().people, forks: m.loadForks().map(f => f.file) })))`
    const out = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, HOME: home, CREW_HOME: dir } })
    const answer = JSON.parse(out.stdout)
    assert.deepEqual(answer.forks, ['one.json'], 'a broken file is left out, not fatal')
    assert.equal(answer.people.wren.apiKey, 'arn_crewkey')
    assert.equal(answer.people['internal-tools-wren'].apiKey, 'arn_forkone')
    assert.equal(answer.people['internal-tools-pia'].email, 'acme-f1-pia@crew.invalid')
  })
})

// ---------- crew update: the kit folder and the owner files (no browser needed) ----------

describe('crew update: the kit folder and the owner files', () => {
  const kitFilesOf = dir => readFileSync(join(dir, 'kit-files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  const editFile = (path, change) => writeFileSync(path, change(readFileSync(path, 'utf8')))

  // A copy of the kit's listed files, as a folder the crew runs from.
  function copyKit(dest, from = KIT) {
    mkdirSync(dest, { recursive: true })
    for (const name of [...kitFilesOf(from), 'kit-files.txt']) copyFileSync(join(from, name), join(dest, name))
  }
  function writeConfig(crew, url) {
    writeFileSync(join(crew.home, 'crew.json'), JSON.stringify({ team: 'Test Crew', crew: { slug: 'test' }, product: { name: 'Test', repo: '' }, board: { url } }))
  }
  function newCrew() {
    const root = mkdtempSync(join(SCRATCH, 'kit-update-'))
    made.push(root)
    const crew = { root, home: join(root, 'home'), claude: join(root, 'claude') }
    mkdirSync(crew.home)
    mkdirSync(crew.claude)
    writeConfig(crew, 'http://127.0.0.1:9')
    return crew
  }
  const runScript = (file, args, crew) => new Promise(resolve => execFile(process.execPath, [file, ...args], {
    env: { ...process.env, CREW_HOME: crew.home, CLAUDE_CONFIG_DIR: crew.claude },
    timeout: 120000
  }, (error, stdout, stderr) => resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr })))
  const updateKit = (dir, crew, args = []) => runScript(join(dir, 'update.mjs'), args, crew)

  // The kit folder the crew runs from: a copy of this kit, rendered once by init. init's FAIL line about
  // playwright is expected in a copy with no node_modules, and these tests do not check it.
  async function installedKit(crew) {
    const dir = join(crew.root, 'kitA')
    copyKit(dir)
    await runScript(join(dir, 'init.mjs'), [], crew)
    return dir
  }
  // A newer kit: a changed CHANGELOG line about the server, a changed template line, watch.mjs removed.
  function newerKit(dirA, crew) {
    const dir = join(crew.root, 'kitB')
    copyKit(dir, dirA)
    editFile(join(dir, 'CHANGELOG.md'), text => `${text}\n- Test line for the server/ side.\n`)
    editFile(join(dir, 'PROJECT-RULES.md.tmpl'), text => text.replace('Replace the examples below', 'Replace the examples here'))
    rmSync(join(dir, 'watch.mjs'))
    editFile(join(dir, 'kit-files.txt'), text => text.replace(/^watch\.mjs\n/m, ''))
    return dir
  }
  const ownerFile = crew => join(crew.home, 'PROJECT-RULES.md')
  const backupsOf = crew => readdirSync(join(crew.home, 'backups')).filter(name => name.startsWith('update-'))
  function snapshot(dir, base = dir, out = {}) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) snapshot(path, base, out)
      else out[path.slice(base.length)] = readFileSync(path, 'utf8')
    }
    return out
  }

  test('a kit folder that matches the kit changes nothing', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const before = snapshot(crew.home)
    const out = await updateKit(dirA, crew, ['--from', KIT, '--kit', dirA])
    assert.equal(out.code, 0, out.stderr)
    assert.match(out.stdout, /is up to date/)
    assert.deepEqual(snapshot(crew.home), before, 'the crew home is the same after the check')
    assert.deepEqual(backupsOf(crew), [], 'no backup when nothing changed')
  })

  test('--check reports an available update and writes nothing', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    const before = snapshot(crew.home)
    const out = await updateKit(dirA, crew, ['--check', '--from', dirB, '--kit', dirA])
    assert.equal(out.code, 1, out.stderr)
    assert.match(out.stdout, /An update is available/)
    assert.deepEqual(snapshot(crew.home), before)
    assert.doesNotMatch(readFileSync(join(dirA, 'CHANGELOG.md'), 'utf8'), /Test line/, 'the kit is not changed by a check')
  })

  test('an update installs the newer kit, merges the owner file and lists the server-side change', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(ownerFile(crew), text => `${text}\nOwner line kept.\n`)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.match(out.stdout, /PROJECT-RULES\.md: your edits and the new template merged cleanly/, out.stdout + out.stderr)
    assert.equal(existsSync(join(dirA, 'watch.mjs')), false, 'a file the new kit no longer ships is removed')
    assert.match(readFileSync(join(dirA, 'CHANGELOG.md'), 'utf8'), /Test line for the server\/ side/)
    assert.equal(readFileSync(join(dirA, 'kit-files.txt'), 'utf8'), readFileSync(join(dirB, 'kit-files.txt'), 'utf8'), 'the list of files is installed with the kit')
    const owner = readFileSync(ownerFile(crew), 'utf8')
    assert.match(owner, /Owner line kept\./, 'owner text is not lost')
    assert.match(owner, /Replace the examples here/, 'the new template line is in')
    assert.doesNotMatch(owner, /<<<<<<</)
    assert.match(out.stdout, /server side, not changed here: Test line for the server\/ side\./)
    const [backup] = backupsOf(crew)
    assert.ok(backup, 'a backup folder was made')
    assert.ok(existsSync(join(crew.home, 'backups', backup, 'kit', 'watch.mjs')), 'the removed file is in the backup')
    const manifest = JSON.parse(readFileSync(join(crew.home, 'crew-kit.json'), 'utf8'))
    assert.ok(manifest.files['update.mjs'], 'the install is recorded')
    const again = await updateKit(dirA, crew, ['--check', '--from', dirB, '--kit', dirA])
    assert.equal(again.code, 0, again.stdout)
  })

  test('an owner edit on the line the template changed is a conflict: the owner file is kept', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(ownerFile(crew), text => text.replace('Replace the examples below', 'Replace the examples by hand'))
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 1)
    assert.match(out.stdout, /CONFLICT PROJECT-RULES\.md/)
    const owner = readFileSync(ownerFile(crew), 'utf8')
    assert.match(owner, /Replace the examples by hand/, 'the owner text is kept')
    assert.doesNotMatch(owner, /<<<<<<</)
    const [backup] = backupsOf(crew)
    assert.match(readFileSync(join(crew.home, 'backups', backup, 'PROJECT-RULES.md.merged'), 'utf8'), /<<<<<<</, 'the merge with markers is set aside')
  })

  test('a crew home with no recorded template keeps its owner file and sets the new one aside', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    rmSync(join(crew.home, 'kit-base'), { recursive: true, force: true })
    editFile(ownerFile(crew), text => `${text}\nOwner line kept.\n`)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.match(out.stdout, /WARN PROJECT-RULES\.md: no template was recorded for this file/)
    assert.ok(existsSync(join(crew.home, 'kit-base', 'PROJECT-RULES.md')), 'the new template is recorded as the base')
    assert.match(readFileSync(ownerFile(crew), 'utf8'), /Owner line kept\./)
    const [backup] = backupsOf(crew)
    assert.match(readFileSync(join(crew.home, 'backups', backup, 'PROJECT-RULES.md.new'), 'utf8'), /Replace the examples here/)
  })

  test('a kit without update.mjs is refused and the kit folder is left alone', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    rmSync(join(dirB, 'update.mjs'))
    editFile(join(dirB, 'kit-files.txt'), text => text.replace(/^update\.mjs\n/m, ''))
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 3)
    assert.match(out.stderr, /cannot update itself/)
    assert.ok(existsSync(join(dirA, 'watch.mjs')))
    assert.deepEqual(backupsOf(crew), [])
  })

  test('a --from folder cannot name a file outside itself', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    writeFileSync(join(crew.root, 'escape.mjs'), 'outside the kit folder\n')
    editFile(join(dirB, 'kit-files.txt'), text => `${text}../escape.mjs\n`)
    const before = snapshot(dirA)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 3)
    assert.match(out.stderr, /lists "\.\.\/escape\.mjs", which a kit does not ship/)
    assert.deepEqual(snapshot(dirA), before, 'nothing is installed')
    assert.deepEqual(backupsOf(crew), [])
  })

  test('a bare fonts.conf listed in a --from folder is refused, and nothing is installed', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    writeFileSync(join(dirB, 'fonts.conf'), '<fontconfig/>\n')
    editFile(join(dirB, 'kit-files.txt'), text => `${text}fonts.conf\n`)
    const before = snapshot(dirA)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 3, out.stderr)
    assert.match(out.stderr, /lists "fonts\.conf", which a kit does not ship/)
    assert.deepEqual(snapshot(dirA), before, 'nothing is installed')
    assert.deepEqual(backupsOf(crew), [])
  })

  test('a --from folder whose kit-files.txt names a missing file is refused: the name is given, --kit is unchanged, no stage folder is left', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(join(dirB, 'kit-files.txt'), text => `${text}missing.mjs\n`)
    const before = snapshot(dirA)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 3, out.stderr)
    assert.match(out.stderr, /lists "missing\.mjs", but .+ has no file of that name/)
    assert.deepEqual(snapshot(dirA), before, '--kit is unchanged')
    assert.deepEqual(readdirSync(crew.home).filter(name => name.startsWith('.update-')), [], 'no stage folder is left')
    assert.deepEqual(backupsOf(crew), [])
  })

  test('a symlink listed in a --from folder is refused, and nothing is installed', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(join(dirB, 'kit-files.txt'), text => `${text}link.mjs\n`)
    assert.equal(spawnSync('ln', ['-s', join(dirB, 'CHANGELOG.md'), join(dirB, 'link.mjs')]).status, 0)
    const before = snapshot(dirA)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 3)
    assert.match(out.stderr, /link\.mjs is not a regular file/)
    assert.deepEqual(snapshot(dirA), before, 'nothing is installed')
  })

  test('a copy that fails puts the kit folder back and says so', { skip: process.getuid?.() === 0 && 'root writes read-only files' }, async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    const before = snapshot(dirA)
    // CHANGELOG.md is copied first, then this read-only file fails; the copy of CHANGELOG.md must be undone.
    assert.equal(spawnSync('chmod', ['444', join(dirA, 'PROJECT-RULES.md.tmpl')]).status, 0)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(out.code, 1)
    assert.match(out.stderr, /installing the kit failed/)
    assert.match(out.stderr, /put back/)
    assert.equal(existsSync(join(dirA, 'watch.mjs')), true, 'the removals did not run')
    assert.deepEqual(snapshot(dirA), before, 'the kit folder is as it was')
  })

  test('the --check run leaves no staging folder in the crew home', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    await updateKit(dirA, crew, ['--check', '--from', dirB, '--kit', dirA])
    assert.deepEqual(readdirSync(crew.home).filter(name => name.startsWith('.update-')), [])
  })

  test('a file the kit does not ship is refused from a folder and from an archive, and nothing is installed', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    writeFileSync(join(dirB, 'payload.bin'), 'not a kit file\n')
    editFile(join(dirB, 'kit-files.txt'), text => `${text}payload.bin\n`)
    const before = snapshot(dirA)
    const folder = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.equal(folder.code, 3, folder.stderr)
    assert.match(folder.stderr, /lists "payload\.bin", which a kit does not ship/)
    const archive = join(crew.root, 'payload.tar.gz')
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', dirB, ...kitFilesOf(dirB)], { encoding: 'utf8' }).status, 0)
    const file = await updateKit(dirA, crew, ['--from', archive, '--kit', dirA])
    assert.equal(file.code, 3, file.stderr)
    assert.match(file.stderr, /the archive lists "payload\.bin", which a kit does not ship/)
    assert.deepEqual(snapshot(dirA), before, 'nothing is installed')
    assert.deepEqual(backupsOf(crew), [])
  })

  test('an owner file with no recorded template gets the next template change merged by the update after it', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    rmSync(join(crew.home, 'kit-base'), { recursive: true, force: true })
    editFile(ownerFile(crew), text => `${text}\nOwner line kept.\n`)
    const first = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.match(first.stdout, /WARN PROJECT-RULES\.md: no template was recorded/)
    const dirC = join(crew.root, 'kitC')
    copyKit(dirC, dirB)
    editFile(join(dirC, 'PROJECT-RULES.md.tmpl'), text => text.replace('## Editing files', '## Editing code'))
    const second = await updateKit(dirA, crew, ['--from', dirC, '--kit', dirA])
    assert.match(second.stdout, /PROJECT-RULES\.md: your edits and the new template merged cleanly/, second.stdout + second.stderr)
    const owner = readFileSync(ownerFile(crew), 'utf8')
    assert.match(owner, /Owner line kept\./, 'owner text is not lost')
    assert.match(owner, /## Editing code/, 'the later template change is in')
    assert.doesNotMatch(owner, /<<<<<<</)
  })

  test('a board update removes a file the new kit dropped, and the next board update removes what the record of the last install names', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    // The board's archive carries the listed files only, never kit-files.txt, as the server packs it.
    const packBoardKit = (dir, name) => {
      const archive = join(crew.root, name)
      assert.equal(spawnSync('tar', ['-czf', archive, '-C', dir, ...kitFilesOf(dir)], { encoding: 'utf8' }).status, 0)
      return readFileSync(archive)
    }
    const board = { body: packBoardKit(dirB, 'board-b.tar.gz') }
    const server = http.createServer((req, res) => {
      if (req.url !== '/crew/kit.tar.gz') {
        res.statusCode = 404
        return res.end('')
      }
      res.setHeader('x-crew-kit-version', 'board-test')
      res.end(board.body)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      writeConfig(crew, `http://127.0.0.1:${server.address().port}`)
      await updateKit(dirA, crew)
      assert.equal(existsSync(join(dirA, 'watch.mjs')), false, 'a board update removes what the new kit dropped')
      const first = JSON.parse(readFileSync(join(crew.home, 'crew-kit.json'), 'utf8'))
      assert.equal(first.files['watch.mjs'], undefined, 'the record of the install no longer names it')
      const dirC = join(crew.root, 'kitC')
      copyKit(dirC, dirB)
      writeFileSync(join(dirC, 'extra.mjs'), 'export const extra = 1\n')
      editFile(join(dirC, 'kit-files.txt'), text => `${text}extra.mjs\n`)
      board.body = packBoardKit(dirC, 'board-c.tar.gz')
      await updateKit(dirA, crew)
      assert.ok(existsSync(join(dirA, 'extra.mjs')), 'the file the new kit adds is installed')
      const dirD = join(crew.root, 'kitD')
      copyKit(dirD, dirC)
      rmSync(join(dirD, 'extra.mjs'))
      editFile(join(dirD, 'kit-files.txt'), text => text.replace(/^extra\.mjs\n/m, ''))
      board.body = packBoardKit(dirD, 'board-d.tar.gz')
      await updateKit(dirA, crew)
      assert.equal(existsSync(join(dirA, 'extra.mjs')), false, 'the next board update removes it, from the record of the last install')
    } finally {
      server.close()
    }
  })

  test('a skill copy that still matches the old kit is refreshed', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(join(dirB, 'SKILL.md'), text => `${text}\nTest line for the skill.\n`)
    const skillDir = join(crew.claude, 'skills', 'taskmanager-crew')
    mkdirSync(skillDir, { recursive: true })
    copyFileSync(join(dirA, 'SKILL.md'), join(skillDir, 'SKILL.md'))
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.match(out.stdout, /skill taskmanager-crew: copy refreshed from the kit/, out.stdout + out.stderr)
    assert.equal(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), readFileSync(join(dirB, 'SKILL.md'), 'utf8'))
  })

  test('a skill copy with a local edit is left alone, and the update says so', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    editFile(join(dirB, 'SKILL.md'), text => `${text}\nTest line for the skill.\n`)
    const skillDir = join(crew.claude, 'skills', 'taskmanager-crew')
    mkdirSync(skillDir, { recursive: true })
    const mine = `${readFileSync(join(dirA, 'SKILL.md'), 'utf8')}My own line.\n`
    writeFileSync(join(skillDir, 'SKILL.md'), mine)
    const out = await updateKit(dirA, crew, ['--from', dirB, '--kit', dirA])
    assert.match(out.stdout, /WARN skill taskmanager-crew: the copy at .+ differs from the kit and was not touched/, out.stdout + out.stderr)
    assert.equal(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), mine, 'the local edit is kept')
  })

  test('without --from the kit comes from the board, and its version is reported', async () => {
    const crew = newCrew()
    const dirA = await installedKit(crew)
    const dirB = newerKit(dirA, crew)
    const archive = join(crew.root, 'kit.tar.gz')
    const packed = spawnSync('tar', ['-czf', archive, '-C', dirB, ...kitFilesOf(dirB)], { encoding: 'utf8' })
    assert.equal(packed.status, 0, packed.stderr)
    const body = readFileSync(archive)
    const server = http.createServer((req, res) => {
      if (req.url !== '/crew/kit.tar.gz') {
        res.statusCode = 404
        return res.end('')
      }
      res.setHeader('x-crew-kit-version', 'abc123def456')
      res.end(body)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      writeConfig(crew, `http://127.0.0.1:${server.address().port}`)
      const out = await updateKit(dirA, crew)
      assert.match(out.stdout, /\(version abc123def456\)/, out.stdout + out.stderr)
      assert.match(readFileSync(join(dirA, 'CHANGELOG.md'), 'utf8'), /Test line for the server/)
    } finally {
      server.close()
    }
  })
})

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('crew mentions: the updates that ask Boss something', async () => {
  const { MENTION, createWatcher, follow, mentionLines, rpcResult } = await import('./mentions.mjs')
  const task = { id: 't1', title: 'A card' }

  // A fake board: get_board gives each card's update count, get_task the updates after `since`.
  function fakeBoard() {
    const cards = { t1: { id: 't1', title: 'A card', updatedAt: '2026-11-05T15:00:00.000Z', updates: [] } }
    const calls = []
    let failGetTask = 0
    const call = async (name, args) => {
      calls.push([name, args])
      if (name === 'get_board') {
        return { columns: [{ name: 'To do', tasks: Object.values(cards).map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, updates: c.updates.length })) }] }
      }
      if (failGetTask > 0) {
        failGetTask--
        throw new Error('get_task answered HTTP 502')
      }
      return { updates: cards[args.id].updates.filter(u => u.at > args.since) }
    }
    const post = (body, author = 'fork taskmanager-pia (agent)') => {
      const card = cards.t1
      card.updates.push({ id: `u${card.updates.length + 1}`, at: new Date(Date.now() + card.updates.length).toISOString(), author, body })
    }
    const failNext = (n) => {
      failGetTask = n
    }
    return { call, calls, post, failNext }
  }
  const freshState = () => ({ since: new Date(Date.now() - 60000).toISOString(), counts: {}, seen: [] })

  test('finds @cato and @boss as words of their own, and not inside an address or a longer name', () => {
    assert.ok(MENTION.test('QUESTION @cato: which one?'))
    assert.ok(MENTION.test('@Boss please merge'))
    assert.ok(MENTION.test('ask @cato.'))
    assert.ok(!MENTION.test('Cato merged it'))
    assert.ok(!MENTION.test('mail x@cato.nl'))
    assert.ok(!MENTION.test('@catoni'))
  })

  test('only Pia reaches Boss: @cato from a worker, a reviewer or Boss itself is ignored', () => {
    const updates = [
      { id: 'w', author: 'fork taskmanager-wren (agent)', body: '@cato can I push?' },
      { id: 'q', author: 'Quincy Average (agent)', body: '@cato QA question' },
      { id: 'c', author: 'Cato (agent)', body: '@pia quoting @cato' },
      { id: 'p1', author: 'fork taskmanager-pia (agent)', body: '@cato from the fork' },
      { id: 'p2', author: 'Pia Planner (agent)', body: '@cato from the crew' },
      { id: 'm', author: 'Maria Pia', body: '@cato a person named Pia' },
      { id: 'n', author: 'Pia Planner', body: '@cato not an agent' },
      { id: 'o', author: 'fork taskmanager-pianist (agent)', body: '@cato another role' }
    ]
    assert.deepEqual(mentionLines(task, updates, new Set()).map(f => f.id), ['p1', 'p2'])
  })

  test('skips Boss\'s own updates and cuts a long one to 240 characters', () => {
    assert.deepEqual(mentionLines(task, [{ id: 'u1', author: 'Cato (agent)', body: '@pia quoting @cato' }], new Set()), [])
    const [found] = mentionLines(task, [{ id: 'u2', author: 'Pia Planner (agent)', body: `@cato ${'x'.repeat(400)}` }], new Set())
    assert.ok(found.line.endsWith('…'))
    assert.ok(found.line.length < 320)
  })

  test('a comment-only update is found, although the card\'s updatedAt does not change', async () => {
    const board = fakeBoard()
    const watcher = createWatcher({ call: board.call, boards: ['b1'], state: freshState() })
    assert.deepEqual(await watcher.pass(), [])
    board.post('QUESTION @cato:\nwhich   one?')
    assert.deepEqual(await watcher.pass(), ['@cato on t1 "A card" by fork taskmanager-pia (agent): QUESTION @cato: which one?'])
    assert.deepEqual(await watcher.pass(), [], 'printed once')
  })

  test('a card whose update count did not change is not read again', async () => {
    const board = fakeBoard()
    board.post('no mention')
    const watcher = createWatcher({ call: board.call, boards: ['b1'], state: freshState() })
    await watcher.pass()
    const reads = board.calls.filter(([name]) => name === 'get_task').length
    await watcher.pass()
    assert.equal(board.calls.filter(([name]) => name === 'get_task').length, reads)
  })

  test('a burst of updates loses no mention: get_task is asked for everything since the last check', async () => {
    const board = fakeBoard()
    const watcher = createWatcher({ call: board.call, boards: ['b1'], state: freshState() })
    await watcher.pass()
    board.post('@cato first')
    for (let n = 0; n < 7; n++) board.post(`update ${n}`)
    const lines = await watcher.pass()
    assert.equal(lines.length, 1)
    assert.ok(board.calls.some(([name, args]) => name === 'get_task' && args.since && args.limit === undefined))
  })

  test('a pass that fails loses nothing: the mention comes on the next pass', async () => {
    const board = fakeBoard()
    const watcher = createWatcher({ call: board.call, boards: ['b1'], state: freshState() })
    await watcher.pass()
    board.post('@cato are you there?')
    board.failNext(1)
    await assert.rejects(watcher.pass(), /502/)
    assert.equal((await watcher.pass()).length, 1)
  })

  test('a JSON-RPC error or a tool error is an error, never an empty board', () => {
    assert.throws(() => rpcResult('get_board', { error: { code: -32603, message: 'boom' } }), /boom/)
    assert.throws(() => rpcResult('get_board', { result: { isError: true, content: [{ type: 'text', text: 'No board "x"' }] } }), /No board/)
    assert.throws(() => rpcResult('get_board', { result: {} }), /no content/)
    assert.deepEqual(rpcResult('get_board', { result: { content: [{ type: 'text', text: '{"columns":[]}' }] } }), { columns: [] })
  })

  test('a board the key cannot open is dropped with one line, and the other boards are still read', async () => {
    const board = fakeBoard()
    const notes = []
    const call = (name, args) => (args.board === 'gone' ? Promise.reject(new Error('get_board: No board "gone"')) : board.call(name, args))
    const watcher = createWatcher({ call, boards: ['gone', 'b1'], state: freshState(), note: line => notes.push(line) })
    await watcher.pass()
    board.post('@cato hi')
    assert.equal((await watcher.pass()).length, 1)
    assert.equal(notes.length, 1)
  })

  test('a column clipped at 200 cards is said once, not skipped without a word', async () => {
    const notes = []
    const call = async () => ({ columns: [{ name: 'Done', omitted: 12, tasks: [] }] })
    const watcher = createWatcher({ call, boards: ['b1'], state: freshState(), note: line => notes.push(line) })
    await watcher.pass()
    await watcher.pass()
    assert.equal(notes.length, 1)
    assert.match(notes[0], /"Done".*12 more cards/)
  })

  test('a saved since that is not a time reads the last 24 hours instead of failing every pass', async () => {
    const board = fakeBoard()
    board.post('@cato still there?')
    const state = { since: 'not a time', counts: {}, seen: [] }
    const watcher = createWatcher({ call: board.call, boards: ['b1'], state })
    assert.equal((await watcher.pass()).length, 1)
    assert.ok(!Number.isNaN(Date.parse(state.since)))
    // It asked for 24 hours back (plus the 5-second overlap), measured from the start of the pass.
    const [, args] = board.calls.find(([name]) => name === 'get_task')
    const back = Date.parse(state.since) - Date.parse(args.since)
    assert.ok(back >= 86400000 + 5000 && back < 86400000 + 5000 + 1000, `asked for ${back} ms back`)
  })

  test('follow prints one line when checks start failing and one when they work again', async () => {
    const printed = []
    const answers = [['@cato one'], new Error('down'), new Error('down'), new Error('down'), [], ['@cato two']]
    const pass = async () => {
      const next = answers.shift()
      if (next instanceof Error) throw next
      return next
    }
    await follow({ pass, print: text => printed.push(text), wait: async () => {}, rounds: 6 })
    assert.deepEqual(printed, [
      '@cato one',
      'crew mentions: check failed (down); trying again every 60 s',
      'crew mentions: the board answers again',
      '@cato two'
    ])
  })
})

// ---------- crew idle: who is free, and what they may start, from the crew_activity answer ----------
describe('crew idle', () => {
  const activity = {
    boardId: 'b1',
    boardName: 'Board',
    crewName: 'Crew',
    people: [
      { key: 'pia', name: 'Pia Planner', role: 'pm', state: 'reviewing', cards: [{ id: 'v1', title: 'In verify' }], waitingOn: [], next: [] },
      { key: 'wren', name: 'Wren Worker', role: 'worker', state: 'working', cards: [{ id: 'd1', title: 'On desk' }], waitingOn: [], next: [] },
      { key: 'wick', name: 'Wick Worker', role: 'worker', state: 'idle', cards: [], waitingOn: ['UX'], next: [{ id: 'b2', title: 'Mine', assignedToMe: true }, { id: 'b3', title: 'Free', assignedToMe: false }] },
      { key: 'wynn', name: 'Wynn Worker', role: 'worker', state: 'idle', cards: [], waitingOn: [], next: [{ id: 'b3', title: 'Free', assignedToMe: false }] },
      { key: 'usher', name: 'Usher Xander', role: 'ux', state: 'idle', cards: [], waitingOn: [], next: [] }
    ]
  }

  test('lists each free worker, and only workers, with the gate a card waits in and what they may start', () => {
    const lines = formatIdle(activity)
    assert.equal(lines[0], 'idle wick (Wick Worker), waiting on UX: Mine (yours); Free (unassigned)')
    assert.equal(lines[1], 'idle wynn (Wynn Worker): Free (unassigned)')
    assert.equal(lines.length, 3, 'two worker lines and the startable line; the working worker and the reviewers are not listed')
  })

  test('the startable line gives each card once, in order, and nobody else', () => {
    const last = formatIdle(activity).at(-1)
    assert.equal(last, 'startable: b2 Mine (yours) | b3 Free (unassigned)')
  })

  test('with no free worker it says so, and a worker with nothing startable says that', () => {
    const none = { people: [{ key: 'wren', name: 'Wren Worker', role: 'worker', state: 'working', cards: [], waitingOn: [], next: [] }] }
    assert.deepEqual(formatIdle(none), ['no idle worker'])
    const bare = { people: [{ key: 'wade', name: 'Wade Worker', role: 'worker', state: 'idle', cards: [], waitingOn: [], next: [] }] }
    assert.deepEqual(formatIdle(bare), ['idle wade (Wade Worker): nothing startable in Backlog'])
  })

  test('the tool answer is read from the JSON line after any warning, and a missing answer is not guessed', () => {
    const text = 'Cannot detect the correct bin file\n{"boardId":"b1","people":[]}\n'
    assert.deepEqual(parseActivity(text), { boardId: 'b1', people: [] })
    assert.equal(parseActivity('no json here\n'), null)
    assert.deepEqual(formatIdle(null), ['no crew activity to show'])
  })
})
