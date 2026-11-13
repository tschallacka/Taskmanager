// kit-imports: every kit file that another kit file imports is itself listed in kit-files.txt, so a packed kit
// never ships a file that imports something missing from it.
//   node --test crew/kit-imports.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function kitFiles() {
  return readFileSync(join(here, 'kit-files.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

// Relative module specifiers from import/export statements and dynamic import() calls.
function relativeImports(source) {
  const found = new Set()
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g
  let match
  while ((match = pattern.exec(source)) !== null) found.add(match[2])
  return [...found]
}

test('kit-files.txt lists every kit file that the kit files import', () => {
  const listed = new Set(kitFiles())
  const missing = []
  for (const file of listed) {
    if (!/\.(mjs|js)$/.test(file)) continue
    const source = readFileSync(join(here, file), 'utf8')
    for (const spec of relativeImports(source)) {
      const target = spec.replace(/^\.\//, '')
      if (!/\.(mjs|js)$/.test(target)) continue
      if (!listed.has(target)) missing.push(`${file} imports ${spec}`)
    }
  }
  assert.deepEqual(missing, [], `kit files import files that kit-files.txt does not list:\n${missing.join('\n')}`)
})

test('the checker finds static, export-from and dynamic relative imports', () => {
  const source = [
    "import { a } from './one.mjs'",
    "export { b } from './two.mjs'",
    "const c = await import('./three.mjs')",
    "import x from 'node:fs'",
  ].join('\n')
  assert.deepEqual(relativeImports(source).sort(), ['./one.mjs', './three.mjs', './two.mjs'])
})
