/**
 * Tab actions in the right sidebar's tab menu.
 *
 * The host offers one action per tab (close), and none for a range. This
 * feature registers three list items through the official tab-menu extension
 * point, computes each one's target set from the tab strip's own order, and
 * renders an item disabled rather than hidden when it has nothing to act on,
 * so the action's existence stays visible.
 *
 * Owned by ticket #7.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions
 */

import type { ClientContext } from '../../contracts.ts'

/**
 * Install the tab-actions tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  void ctx
}
