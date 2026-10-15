/**
 * Types for {@link ./platform-modules.mjs}, which is written as `.mjs` so both
 * `node scripts/check-artifact.mjs` and the TypeScript build config can import
 * the same declaration.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/platform-modules
 */

/**
 * Module specifiers the browser half may resolve from the shell's module table.
 *
 * A `Set` because every consumer's only question is membership.
 */
export declare const PLATFORM_MODULES: ReadonlySet<string>
