/**
 * The file panel.
 *
 * The built-in `files` tab is one tab competing with the file it opened. This
 * feature takes over the `files` tab kind with a type in the `extension` band,
 * so the built-in type steps aside, and renders one panel that persists across
 * every file tab: one DOM, one state, so expansion, loaded levels, the filter
 * word and scroll position are shared and no directory is watched twice.
 *
 * Owned by ticket #4, with two seams its dependents fill in:
 * `open-file.ts` (ticket #5) and `activation.ts` (ticket #6).
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel
 */

import type { ClientContext } from '../../contracts.ts'

/**
 * Install the file-panel tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  void ctx
}
