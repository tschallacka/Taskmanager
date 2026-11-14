// The profile picture and display name rules (server/utils/avatarRules.ts): the type and size limits, what an SVG may
// contain, that only the person may change their own profile, and the name's length.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_MAX_BYTES, displayNameOf, mayChangeProfile, svgProblem, uploadProblem } from '../server/utils/avatarRules'

test('upload: PNG, JPEG, WebP and SVG within 2 MB; other types, empty files and bigger files are refused', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) assert.equal(uploadProblem({ type, bytes: 1000 }), null)
  assert.match(uploadProblem({ type: 'application/pdf', bytes: 1000 }) ?? '', /PNG, JPEG, WebP or SVG/)
  assert.match(uploadProblem({ type: 'image/png', bytes: 0 }) ?? '', /empty/)
  assert.equal(uploadProblem({ type: 'image/png', bytes: AVATAR_MAX_BYTES }), null, 'exactly 2 MB is allowed')
  assert.match(uploadProblem({ type: 'image/png', bytes: AVATAR_MAX_BYTES + 1 }) ?? '', /2 MB or smaller/)
})

test('SVG: a plain picture is fine; scripts, event handlers, javascript: links, embedded content and outside references are refused', () => {
  assert.equal(svgProblem('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#0f766e"/></svg>'), null)
  assert.equal(svgProblem('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'), null, 'an XML declaration is fine')
  assert.match(svgProblem('<svg><script>alert(1)</script></svg>') ?? '', /script/)
  assert.match(svgProblem('<svg><rect onload="alert(1)"/></svg>') ?? '', /event handlers/)
  assert.match(svgProblem('<svg><a href="javascript:alert(1)"><rect/></a></svg>') ?? '', /javascript/)
  assert.match(svgProblem('<svg><foreignObject><div>x</div></foreignObject></svg>') ?? '', /embed/)
  assert.match(svgProblem('<svg><image href="https://evil.example/x.png"/></svg>') ?? '', /outside the file/)
  assert.match(svgProblem('<svg><style>@import "https://evil.example/a.css";</style></svg>') ?? '', /load anything/)
  assert.match(svgProblem('<html><body>not svg</body></html>') ?? '', /not an SVG/)
})

test('only the person may change their own profile: not a manager, not an admin, not nobody', () => {
  assert.equal(mayChangeProfile('user_1', 'user_1'), true)
  assert.equal(mayChangeProfile('user_2', 'user_1'), false, 'another person, even a manager')
  assert.equal(mayChangeProfile(null, 'user_1'), false)
  assert.equal(mayChangeProfile(undefined, 'user_1'), false)
})

test('display name: trimmed, 1 to 60 characters', () => {
  assert.deepEqual(displayNameOf('  Maria Pia  '), { name: 'Maria Pia' })
  assert.match((displayNameOf('   ') as { problem: string }).problem, /at least one character/)
  assert.match((displayNameOf(null) as { problem: string }).problem, /at least one character/)
  assert.deepEqual(displayNameOf('x'.repeat(60)), { name: 'x'.repeat(60) })
  assert.match((displayNameOf('x'.repeat(61)) as { problem: string }).problem, /60 characters or fewer/)
})
