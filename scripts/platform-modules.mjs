/**
 * The module-table seed, declared once for both consumers.
 *
 * The shell shares a fixed set of module identities with plugin bundles: a
 * `require` of one of these returns the host's single instance, and anything
 * else must be bundled instead. Two places in this repository need that list,
 * for two different reasons:
 *
 * 1. `tsdown.config.ts` uses it to decide what to keep external
 *    (`neverBundle` / `alwaysBundle`) and to reject a foreign plugin's value
 *    import at build time.
 * 2. `scripts/check-artifact.mjs` uses it to assert that the built artifact only
 *    asks for modules the shell can answer.
 *
 * They must agree: a specifier the build externalizes but the check does not
 * know about is a guaranteed runtime throw, and vice versa. Declaring the list
 * twice would let the two drift on the day upstream changes its seed, so it
 * lives here and both import it.
 *
 * The values mirror the shell's own `PLATFORM_MODULES`
 * (`deepseek-harness/packages/client/web/src/platform.ts`). They are copied as
 * literals rather than imported, because the upstream module lives in the
 * read-only reference submodule, which this repository must never import.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/platform-modules
 */

/**
 * Module specifiers the browser half may resolve from the shell's module table.
 *
 * A `Set` because every consumer's only question is membership.
 * @type {ReadonlySet<string>}
 */
export const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
