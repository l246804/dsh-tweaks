/**
 * Plugin-owned event listeners.
 *
 * A listener is the resource most likely to survive an uninstall and keep a
 * detached node, a stale store or a closed session alive. Registering one
 * through this helper makes the pairing explicit: the same target and the same
 * handler function go to `addEventListener` and `removeEventListener`, so the
 * removal cannot miss. The returned disposer is idempotent because cordis may
 * run a scope's disposal and an explicit release in either order.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/listeners
 */

import type { Disposer } from '../effect.ts'
import type { DocumentLike, ElementLike } from './types.ts'

/** A listener target: anything the narrow DOM surface exposes events on. */
export type ListenerTarget = DocumentLike | ElementLike

/**
 * Attach a listener and hand back its removal.
 * @param target - the element or document to listen on.
 * @param type - the event type.
 * @param handler - the handler, called with the raw event.
 * @returns a disposer that detaches the listener.
 */
export function installListener(
  target: ListenerTarget,
  type: string,
  handler: (event: unknown) => void,
): Disposer {
  target.addEventListener(type, handler)
  let released = false
  return () => {
    if (released)
      return
    released = true
    target.removeEventListener(type, handler)
  }
}
