/**
 * Fix relative import specifiers in emitted .d.ts files.
 *
 * `tsc --emitDeclarationOnly` keeps the TS-source extension (.ts/.tsx) in
 * relative import specifiers because `allowImportingTsExtensions` is on.
 * Consumers of the published package cannot resolve './locales.ts' against
 * lib/types (only locales.d.ts exists), so rewrite them to the JS extension
 * ('.js') that TypeScript maps back to the adjacent .d.ts file.
 *
 * Runs after `tsc` in the build pipeline. Never bundled into the tarball
 * (package.json `files` is an allowlist).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const typesRoot = join(fileURLToPath(new URL('..', import.meta.url)), 'lib', 'types')

/** './x.ts' / './x.tsx' / './dir/x.ts' → './x.js' / './dir/x.js' (quoted specifier only). */
const RELATIVE_TS_SPECIFIER = /((?:from\s*|import\s*\()\s*['"])(\.\.?\/[^'"]*?)(\.tsx?)(['"])/g

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full)
    } else if (full.endsWith('.d.ts')) {
      const before = readFileSync(full, 'utf8')
      const after = before.replace(RELATIVE_TS_SPECIFIER, (_m, pre, spec, _ext, quote) => `${pre}${spec}.js${quote}`)
      if (after !== before) {
        writeFileSync(full, after, 'utf8')
        console.log(`fix-dts: rewrote relative import in ${full.replace(typesRoot + '\\', '').replace(typesRoot + '/', '')}`)
      }
    }
  }
}

walk(typesRoot)
