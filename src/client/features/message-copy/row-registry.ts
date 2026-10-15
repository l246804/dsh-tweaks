/**
 * The mounted user rows, keyed by the conversation context key the host's DOM
 * anchor carries.
 *
 * A `copy` event reaches this plugin without React props, so the listener can
 * only recover a message's content by key. Rows publish themselves here while
 * they are mounted and take themselves out on unmount; the key the listener
 * resolves from the DOM is the key this registry is indexed by, which is why
 * the same `data-chat-node-key` value appears in both.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/row-registry
 */

import type { Disposer } from '../../effect.ts'
import type { CopyOutcome } from './clipboard.ts'
import type { ImageReference, MessageContent } from './payload.ts'

/** What one mounted row makes available to a copy. */
export interface CopySource {
  /** The conversation context key the host's row anchor carries. */
  readonly key: string
  /** The row's message content, split the way the row renders it. */
  readonly content: MessageContent
  /**
   * Start reading one image's bytes.
   *
   * Session-authorized and asynchronous; called from inside the clipboard
   * write so the read is in flight during the browser's synchronous
   * acceptance window.
   * @param image - the image reference to read.
   * @returns the image's bytes.
   */
  readonly readImage: (image: ImageReference) => Promise<Blob>
  /**
   * Show the user what a copy of this row achieved.
   *
   * The row owns this rather than the document listener: the row is mounted
   * and can place a notice where the user's attention already is, and a row
   * that unmounts mid-copy simply reports nowhere instead of into a dead
   * surface.
   * @param outcome - what the copy achieved.
   */
  readonly report: (outcome: CopyOutcome) => void
}

/** The live map of mounted rows a copy can resolve. */
export interface RowRegistry {
  /**
   * Publish one mounted row.
   * @param source - the row's key, content and byte reader.
   * @returns the disposer that unpublishes exactly this row.
   */
  register: (source: CopySource) => Disposer
  /**
   * Resolve the row mounted under one key.
   * @param key - a conversation context key.
   * @returns the row, or undefined when nothing is mounted under that key.
   */
  lookup: (key: string) => CopySource | undefined
  /** How many rows are currently published. */
  size: () => number
  /** Drop every row, for unload. */
  clear: () => void
}

/**
 * Create the mounted-row registry.
 * @returns the registry.
 */
export function createRowRegistry(): RowRegistry {
  const rows = new Map<string, CopySource>()
  return {
    register(source) {
      rows.set(source.key, source)
      let released = false
      return () => {
        if (released)
          return
        released = true
        // Only the current occupant may clear the slot: React can mount a
        // replacement row for a key before the outgoing one's cleanup runs, and
        // the outgoing cleanup must not evict the live row.
        if (rows.get(source.key) === source)
          rows.delete(source.key)
      }
    },
    lookup: key => rows.get(key),
    size: () => rows.size,
    clear: () => { rows.clear() },
  }
}
