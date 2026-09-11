/**
 * Remove the build output before a rebuild.
 *
 * tsc never prunes its emit directory: declarations for modules that were
 * deleted from `src/` survive the next build and are then published with the
 * package (that is how stale `openWith/*.d.ts` and `assignSession.d.ts` reached
 * the 1.0.2 tarball). tsdown writes a fixed bundle set, so only the type emit and
 * the bundles need clearing.
 */
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
rmSync(join(root, 'lib'), { recursive: true, force: true })
