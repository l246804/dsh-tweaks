import { defineConfig } from 'tsdown'
import { StaleGuardRecorder } from 'tsdown-stale-guard'
import { PLATFORM_MODULES } from './scripts/platform-modules.mjs'

/**
 * Plugin id: the package name, the bundle row name, and the client registration
 * key. The browser half must register a factory under exactly this id, because
 * the shell looks up the graph row by package name.
 */
const ID = '@leiwang2000/dsh-tweaks'

/** The browser half's entry, and the published artifact name the loader requests. */
const CLIENT_ENTRY = 'src/client/index.ts'
const CLIENT_ARTIFACT = 'client.js'

/**
 * Another UI plugin's module is the one import that must never be inlined: a
 * second copy of it carries its own store instances and slot declarations, so
 * the duplication is invisible until two copies disagree at runtime.
 *
 * This mirrors the intent of the upstream build-time purity gate
 * (`deepseek-harness/packages/client/tsdown.client.ts`), scoped to the case this
 * package can actually hit. Type-only imports are erased before bundling and
 * never reach this check; cross-plugin collaboration goes through cordis
 * services.
 * @param specifier - the import specifier as written.
 * @returns true when the import must fail the build.
 */
function isForeignPluginValueImport(specifier: string): boolean {
  return specifier.startsWith('@deepseek-ai/dsh-client-ui-') && !PLATFORM_MODULES.has(specifier)
}

const purityGate = {
  name: 'dsh-tweaks-client-purity',
  resolveId(source: string) {
    if (!isForeignPluginValueImport(source))
      return null
    throw new Error(
      `client bundle purity: "${source}" is another UI plugin's module and is not in the platform module table; `
      + 'importing it would inline a second copy of its runtime identity. '
      + 'Reach it through a cordis service, or import it type-only.',
    )
  },
}

export default defineConfig([
  // Host half: an ordinary ESM package the Loader imports for the bundle row.
  {
    name: ID,
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: true,
    // The client config writes into the same directory and must not be wiped,
    // so cleaning happens here only, before either face is emitted.
    clean: true,
    exports: { customExports: { './client': `./dist/${CLIENT_ARTIFACT}` } },
    publint: true,
    plugins: [StaleGuardRecorder()],
  },
  // Browser half: the closure factory `window.__ModuleLoader__.load(...)`.
  {
    name: `${ID}/client`,
    entry: { client: CLIENT_ENTRY },
    outDir: 'dist',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    // Types for the client face ship from the host build's declaration pass.
    dts: false,
    sourcemap: true,
    clean: false,
    exports: false,
    publint: false,
    deps: {
      neverBundle: (specifier: string) => PLATFORM_MODULES.has(specifier),
      alwaysBundle: (specifier: string) => !PLATFORM_MODULES.has(specifier),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    plugins: [purityGate, StaleGuardRecorder()],
    outputOptions: {
      entryFileNames: CLIENT_ARTIFACT,
      // Registration wrapper: the factory holds the whole module body and runs
      // at materialization, never at script execution. The `intro` supplies the
      // CommonJS bindings the bundled body expects, and the `footer` returns
      // them as the factory's exports.
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
