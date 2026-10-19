/**
 * The host-anchor declaration list, parsed once for both anchor checks.
 *
 * Two checks read `src/client/dom/host-anchors.ts` for different reasons:
 * `check-anchors.mjs` verifies each attribute against the pinned upstream tree,
 * and `check-anchors-runtime.mjs` verifies each one against an installed DSH.
 * The declaration form is the single source both read, so the parser lives here
 * rather than being written out twice and drifting.
 *
 * The declaration shape is `{ name: '<attribute>', owner: '<package path>' }`,
 * which is what `HostAnchor` requires and what keeps this free of a second
 * parser for a file the type checker already validates.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/host-anchor-declarations
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root, one level above `scripts/`. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The one module allowed to spell host attributes. */
export const DECLARATIONS = join(PACKAGE_ROOT, 'src/client/dom/host-anchors.ts')

/**
 * @typedef {object} DeclaredAnchor
 * @property {string} name - the attribute name exactly as the host writes it.
 * @property {string} owner - the upstream package path, e.g. `client/ui-dockkit`.
 */

/**
 * Read the declared anchors out of the one module allowed to spell them.
 * @returns {Promise<readonly DeclaredAnchor[]>} the anchors, in declaration order.
 */
export async function readDeclaredAnchors() {
  const source = await readFile(DECLARATIONS, 'utf8')
  const pattern = /\{\s*name:\s*'([^']+)',\s*owner:\s*'([^']+)'\s*\}/gu
  return [...source.matchAll(pattern)].map(match => ({
    /** The attribute name, e.g. `data-dockkit-host`. */
    name: match[1],
    /** The upstream package that writes it, e.g. `client/ui-dockkit`. */
    owner: match[2],
  }))
}

/**
 * Turn an upstream package path into its published package name.
 *
 * The declaration list uses the repository's own spelling (`client/ui-dockkit`)
 * because `check-anchors.mjs` resolves it against the submodule's tree; an
 * installed DSH is addressed by npm name instead.
 * @param {string} owner - the package path, e.g. `client/ui-dockkit`.
 * @returns {string} the npm package name, e.g. `@deepseek-ai/dsh-client-ui-dockkit`.
 */
export function packageNameOf(owner) {
  return `@deepseek-ai/dsh-${owner.replace(/\//gu, '-')}`
}

/**
 * Whether a source file spells one anchor as a *whole* attribute name.
 *
 * A plain `source.includes(name)` is too loose for the job both checks do: a
 * longer attribute in the same family spells its own name and the shorter one
 * as a prefix, so `data-dockkit-tab` would be "found" in a tree that only still
 * writes `data-dockkit-tab-title`. Upstream renaming or dropping the short name
 * would then pass both checks while the patch silently stops matching. An
 * attribute name may only be followed by a character that cannot continue it,
 * which is what makes `data-dockkit-tab"` a hit and `data-dockkit-tab-title`
 * a miss.
 * @param {string} source - the file contents to search.
 * @param {string} attribute - the attribute name, e.g. `data-dockkit-tab`.
 * @returns {boolean} true when the name appears as an entire attribute.
 */
export function spellsAttribute(source, attribute) {
  const pattern = new RegExp(`${escapeRegExp(attribute)}(?![\\w-])`, 'gu')
  return pattern.test(source)
}

/**
 * Escape a literal for use inside a regular expression.
 * @param {string} literal - the text to escape.
 * @returns {string} the text with regex metacharacters escaped.
 */
function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
