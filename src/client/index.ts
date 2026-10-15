/**
 * Browser half of `@leiwang2000/dsh-tweaks`.
 *
 * The shell materializes this module through the closure factory wrapper around
 * it, injecting `react` and the other platform modules from its own module
 * table. `apply` is therefore an ordinary cordis plugin body: it declares the
 * services it needs and installs one tweak per feature.
 *
 * Feature layout: each tweak owns one directory under `src/client/features/`,
 * exports one install function, and is the only writer of its own files. This
 * entry is the single place that enumerates them, so adding a tweak never edits
 * another tweak's code.
 *
 * @module @leiwang2000/dsh-tweaks/client
 */

import type { ClientContext } from './contracts.ts'

export type { ClientContext } from './contracts.ts'

/**
 * Required browser services: the slot registry, the right sidebar's navigation
 * face and tab-type registry, the conversation surface, the session list, the
 * Remote namespaces, and the locale registry.
 */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'sessions', 'remote', 'locale']

/**
 * Install every tweak.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContext): void {
  // Each feature installs inside its own effect scope, so its resources are
  // released when the plugin unloads. Features are added here as they land.
  void ctx
}
