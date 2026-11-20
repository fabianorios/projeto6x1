#!/usr/bin/env node
/**
 * After `vite build`, ensure the *eager* entry chunk does not embed simulate
 * heuristics source. Lazy local-fallback chunks may still contain them.
 *
 * Markers are unique to src/engine/simulate.ts commentary / symbols.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = path.join(root, 'dist', 'assets')

/** Portuguese line-item copy unique to src/engine/simulate.ts (survives minify). */
const MARKERS = [
  'Buffer do cenário não inventa 2ª vaga quando o contínuo tem um único colaborador/posto efetivo.',
  'Gap ideal ',
  'Headcount requerido (estimado)',
]

const entries = await readdir(assetsDir).catch(() => null)
if (!entries) {
  console.error('dist/assets missing — run `npm run build` first')
  process.exit(1)
}

const jsFiles = entries.filter((f) => f.endsWith('.js'))
/** Eager = index / main entry; vite names like index-*.js */
const eager = jsFiles.filter(
  (f) => f.startsWith('index-') || f.startsWith('main-'),
)

if (eager.length === 0) {
  console.error(
    'No eager index/main chunk found in dist/assets:',
    jsFiles.slice(0, 20).join(', '),
  )
  process.exit(1)
}

let failed = false
for (const file of eager) {
  const text = await readFile(path.join(assetsDir, file), 'utf8')
  for (const marker of MARKERS) {
    if (text.includes(marker)) {
      console.error(`Eager chunk ${file} contains heuristic marker: ${marker}`)
      failed = true
    }
  }
}

if (failed) {
  process.exit(1)
}

console.log(
  `OK: ${eager.length} eager chunk(s) lack simulate heuristic markers (${jsFiles.length} total JS assets).`,
)
