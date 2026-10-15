/**
 * Reference highlighting in the composer.
 *
 * A hand-typed `@scope/xxx` is not a reference, but the host derives a
 * decoration for it from a syntax guess and styles it as one. Only a chip the
 * user picked from the candidate list is really a reference. This feature takes
 * the guessed decoration out of reference styling while leaving every other
 * behavior alone: the node stays, its attributes stay, and clicking it still
 * previews when it does name a real target.
 *
 * Owned by ticket #3.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight
 */

import type { ClientContext } from '../../contracts.ts'

/**
 * Install the reference-highlight tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  void ctx
}
