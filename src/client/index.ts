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
import { install as installTabActions } from './features/tab-actions/index.ts'

export type { ClientContext } from './contracts.ts'

/**
 * Required browser services: the slot registry, the right sidebar's navigation
 * face and tab-type registry, the session list, the Remote namespaces, and the
 * locale registry.
 *
 * `remote.workspaceFiles` is a service in its own right rather than a member of
 * `remote`: the gateway registers every Remote namespace as `remote.<name>`, so
 * reading one passes through this fiber's `inject` gate like any other service.
 * Declaring only `remote` therefore fails nothing up front. Before that
 * namespace has ever been registered the read answers `undefined`, and from the
 * first registration onwards it throws `cannot get property
 * "remote.workspaceFiles" without inject`, which the panel hits the first time a
 * reader opens the files tab. The declaration outlives the service, so an unload
 * or a rolled-back mount does not bring `undefined` back; it stays a throw.
 * `remote.$stream` and `remote.$host` do belong to `remote` itself and need no
 * entry of their own.
 *
 * Only services a feature actually calls belong here: naming one is a claim that
 * the plugin cannot work without it, so a service that merely happens to be
 * mounted would hold activation back for nothing. The conversation surface is
 * deliberately absent: no installed feature calls it.
 */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'remote', 'remote.workspaceFiles', 'locale']

/** Every installed tweak, in installation order. */
const FEATURES: readonly ((ctx: ClientContext) => void)[] = [
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
