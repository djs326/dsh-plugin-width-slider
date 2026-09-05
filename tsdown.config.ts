/**
 * tsdown config for dsh-plugin-width-slider.
 *
 * Mirrors the official dsh-web-ui preset (shared/tsdown.client.ts) in a
 * standalone form: the host half is plain ESM for Node, the client half is
 * a CJS bundle wrapped in the window.__ModuleLoader__.load({id, factory})
 * handshake that the dsh client-module loader consumes.
 */
import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-plugin-width-slider'

/**
 * Platform seed modules — the shell's frozen module table provides these at
 * runtime via the injected require().
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

/** Host-side externals: cordis resolves at runtime from the dsh profile tree. */
const HOST_EXTERNALS: readonly (string | RegExp)[] = [
  '@deepseek-ai/cordis',
  /^@deepseek-ai\/dsh-/,
]

const NODE_ENV = JSON.stringify(process.env.NODE_ENV ?? 'production')

export default defineConfig([
  // Host half: plain ESM for Node.
  {
    name: PLUGIN_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    deps: {
      neverBundle: HOST_EXTERNALS,
    },
  },
  // Client half: CJS bundle wrapped in the ModuleLoader factory handshake.
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': NODE_ENV,
      'import.meta.env.MODE': NODE_ENV,
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])