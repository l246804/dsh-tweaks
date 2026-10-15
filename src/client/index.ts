/**
 * Browser half of `@leiwang2000/dsh-tweaks`.
 *
 * The shell materializes this module through the closure factory wrapper around
 * it, injecting `react` and the other platform modules from its own module
 * table. `apply` is therefore an ordinary cordis plugin body: it declares the
 * services it needs and installs one tweak per feature.
 *
 * Feature layout: each tweak owns one directory under `src/client/features/`,
 * exports one `install`, and is the only writer of its own files. This entry is
 * the single place that enumerates them, so adding a tweak never edits another
 * tweak's code.
 *
 * @module @leiwang2000/dsh-tweaks/client
 */

import type { ClientContext } from './contracts.ts'
import { install as installFilePanel } from './features/file-panel/index.ts'
import { install as installMessageCopy } from './features/message-copy/index.ts'
import { install as installReferenceHighlight } from './features/reference-highlight/index.ts'
import { install as installTabActions } from './features/tab-actions/index.ts'

export type { ClientContext } from './contracts.ts'

/**
 * Required browser services: the slot registry, the right sidebar's navigation
 * face and tab-type registry, the conversation surface, the session list, the
 * Remote namespaces, and the locale registry.
 */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'uiConversation', 'sessions', 'remote', 'locale']

/** Every installed tweak, in installation order. */
const FEATURES: readonly ((ctx: ClientContext) => void)[] = [
  installReferenceHighlight,
  installFilePanel,
  installTabActions,
  installMessageCopy,
]

/**
 * Install every tweak.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContext): void {
  for (const install of FEATURES) {
    // Each feature installs inside its own effect scope, so its resources are
    // released when the plugin unloads. A feature registers its own resources
    // through `ctx.effect` too, so this scope owns nothing further.
    ctx.effect(() => {
      install(ctx)
      return () => {}
    }, 'dsh-tweaks: feature')
  }
}
