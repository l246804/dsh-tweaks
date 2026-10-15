/**
 * The document-level `copy` listener: the text-selection half of this feature.
 *
 * The host ships no `copy` listener of its own (it has a per-message copy
 * button and nothing else), so selecting message text and copying it goes
 * through the browser's default behavior and loses attachments entirely. This
 * listener closes that gap: it resolves the selection's row, asks the row for
 * its content, and lets the copy write through the event's own synchronous
 * channel, the one write a browser accepts without awaiting anything.
 *
 * Two deliberate refusals:
 *
 * - A selection outside a user row is left completely alone, so this plugin
 *   cannot change what an assistant or tool row copies.
 * - Nothing is written for a row that has not published itself. A guess would
 *   overwrite the browser's own copy of the selection with the wrong message.
 *
 * The clipboard contents and the user-facing report are never the listener's
 * business: it resolves a row and hands the event's channel to the shared copy
 * action, which reports what it achieved. A route into a copy therefore cannot
 * forget to report.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/listener
 */

import type { DocumentLike } from '../../dom/types.ts'
import type { Disposer } from '../../effect.ts'
import type { CopyEventData, CopyOutcome } from './clipboard.ts'
import type { CopySource, RowRegistry } from './row-registry.ts'
import { installListener } from '../../dom/listeners.ts'
import { copyableRowKey, targetElement } from './selection.ts'

/** What the listener needs from the rest of the feature. */
export interface CopyListenerPorts {
  /** The rows currently mounted, by conversation context key. */
  readonly registry: RowRegistry
  /**
   * Copy one row, writing any synchronously accepted text through `data`.
   * @param source - the row resolved from the selection.
   * @param data - the event's data channel, or undefined when it offered none.
   * @returns what the copy achieved.
   */
  readonly copy: (source: CopySource, data: CopyEventData | undefined) => Promise<CopyOutcome>
}

/**
 * Read an event's `target` and `clipboardData` without trusting its shape.
 *
 * The `copy` event arrives from the page, so every field is treated as
 * possibly absent; a wrong guess here would throw inside a copy handler, which
 * a browser reports as a broken copy rather than a plugin error.
 * @param event - the raw event.
 * @returns the target and data channel, either possibly undefined.
 */
function readEvent(event: unknown): { target: unknown, data: CopyEventData | undefined } {
  if (typeof event !== 'object' || event === null)
    return { target: undefined, data: undefined }
  const candidate = event as { target?: unknown, clipboardData?: unknown }
  const data = candidate.clipboardData
  return {
    target: candidate.target,
    data: typeof data === 'object' && data !== null && typeof (data as CopyEventData).setData === 'function'
      ? data as CopyEventData
      : undefined,
  }
}

/**
 * Attach the copy listener to a document.
 * @param document - the document to listen on.
 * @param ports - the registry, the copy action and the outcome report.
 * @returns a disposer that detaches the listener.
 */
export function installCopyListener(document: DocumentLike, ports: CopyListenerPorts): Disposer {
  const handler = (event: unknown): void => {
    const { target, data } = readEvent(event)
    const key = copyableRowKey(targetElement(target))
    if (key === undefined)
      return
    const source = ports.registry.lookup(key)
    if (source === undefined)
      return
    // The copy runs its synchronous write through `data` before this handler
    // returns; the reporting of what it achieved is the copy action's own job,
    // so both routes into a copy report exactly once.
    void ports.copy(source, data)
  }
  return installListener(document, 'copy', handler)
}
