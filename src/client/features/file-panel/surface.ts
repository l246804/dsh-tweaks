/**
 * Where the panel belongs, decided from an address.
 *
 * The panel is one instance serving two very different homes, and which home it
 * is in is a pure function of the tab that is on screen:
 *
 * - the `files` page tab: the panel *is* the tab, filling it;
 * - a file tab (any address that is a session-scoped file): the panel docks to
 *   the right of the file's content, and the file keeps the rest;
 * - anything else (the guide, a terminal, no tab at all): the panel has no home
 *   and comes off the page, keeping every byte of its state for the next tab
 *   that wants it.
 *
 * Separating this from the DOM is what lets the placement rules be checked
 * without a browser, and it is also where the active file comes from: the
 * third answer a placement has to give, since the panel must mark that file's
 * row.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/surface
 */

import type { PanelMode } from './panel-host.ts'
import { activationTarget } from './activation.ts'

/** The tab kind this feature takes over. */
export const FILES_KIND = 'files'

/** What the panel should do about the tab on screen. */
export type SurfaceDecision
  /** Take the whole tab. */
  = | { readonly kind: 'page' }
  /** Dock beside the file's content, marking that file. */
    | { readonly kind: 'dock', readonly activeKey: string, readonly chain: readonly string[] }
  /** Leave the page; the state stays in memory for the next home. */
    | { readonly kind: 'none' }

/** The scalars the decision needs. */
export interface SurfaceInput {
  /** The address the tab on screen navigated to, or undefined when no tab is on screen. */
  readonly address: string | undefined
  /** The tab's kind, which is how the file-list page identifies itself. */
  readonly kind: string | undefined
  /** The workspace root, or undefined when the session has none. */
  readonly workspaceRoot: string | undefined
}

/**
 * Decide where the panel belongs for one tab.
 *
 * The page case is checked by kind rather than by address, because a page tab's
 * address is the kind's own page address, which the host mints; matching on it
 * would be matching on a string this plugin does not own.
 * @param input - the tab's address and kind, and the workspace root.
 * @returns what the panel should do.
 */
export function decideSurface(input: SurfaceInput): SurfaceDecision {
  const { address, kind, workspaceRoot } = input
  if (address === undefined || kind === undefined)
    return { kind: 'none' }
  if (kind === FILES_KIND)
    return { kind: 'page' }
  const target = activationTarget(address, workspaceRoot)
  if (target === undefined)
    return { kind: 'none' }
  return { kind: 'dock', activeKey: target.key, chain: target.chain }
}

/**
 * This implementation's identity in the tab system.
 *
 * It must **not** be the built-in type's id: the registry pairs one `builtin` with
 * one `extension` per kind, and a repeated id throws. It is also the key the body
 * seat registers under, which is why the two are one constant.
 */
export const FILES_ID = '@leiwang2000/dsh-tweaks/file-panel'

/**
 * The panel's placement as the DOM host needs it.
 * @param decision - the decision from {@link decideSurface}.
 * @returns the mode to dock with, or undefined to stay off the page.
 */
export function modeOf(decision: SurfaceDecision): PanelMode | undefined {
  switch (decision.kind) {
    case 'page': return 'page'
    case 'dock': return 'dock'
    case 'none': return undefined
  }
}
