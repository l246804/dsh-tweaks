/**
 * Noticing that the draft changed, and re-deriving the marks.
 *
 * A reference decoration is derived, not stored: the host re-derives it inside
 * a Lexical entity transform whenever the draft's text changes, and there is no
 * plugin-reachable subscription for that. The editor is a private runtime
 * behind the composer, Lexical itself is not a platform module, and the
 * `@`/`/` trigger sources only publish candidate lists. So the tweak watches the
 * page instead.
 *
 * The watch is anchored at the document root, not at the composer, because the
 * composer element is remounted per session (the queue and the workspace picker
 * replace the editable surface wholesale). The root is stable for the page's
 * life, and a subtree watch covers whatever composer is mounted under it.
 *
 * The attribute filter is deliberate. The tweak's own write is an attribute on
 * a descendant, so without a filter the callback would observe itself. Filtering
 * to `class` keeps the host's own decoration updates, which are the only signal
 * that matters here: the host writes the class, the text and the node in one
 * go. The plugin's marker writes are then invisible to the observer by
 * construction rather than by a re-entrancy guard. `applyPlainTextMarks` also
 * skips a write that would not change anything, so a delivered change cannot
 * cascade even if the filter is ever widened.
 *
 * The alternative official channel is `ctx.slots.register` into
 * `conversation.composer.*`, whose components receive `useInput(s => s.draftRev)`,
 * the host's own "the draft's text changed" revision. That would be a change
 * signal rather than a DOM observation, but it arrives with a React render the
 * tweak would then have to hook, and it is scoped to one session's slot tree.
 * The observer keeps the tweak to one moving part. See
 * `docs/adr/0002-official-channels-first.md`: this patch exists because the
 * upstream channel, a pluggable text-ref rule, does not exist yet, and the
 * observer is the seam to delete when it does.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight/watch
 */

import type { DocumentLike, ElementLike } from '../../dom/types.ts'
import type { Disposer } from '../../effect.ts'
import { applyPlainTextMarks, clearPlainTextMarks } from './marks.ts'

/**
 * The document surface this patch needs.
 *
 * The shared narrow surface has no document root, and widening it would make
 * every patch's budget look larger than it is. Stating the extra requirement
 * here keeps it next to its only use.
 */
export interface ComposerDocumentLike extends DocumentLike {
  /** The document's root element: the stable anchor a subtree watch needs. */
  readonly documentElement: ElementLike
}

/** The observer surface this patch uses. */
interface MutationObserverLike {
  /**
   * Watch a node's subtree.
   * @param target - the node to watch.
   * @param options - what to report.
   */
  observe: (target: ElementLike, options?: MutationObserverOptions) => void
  /** Stop watching. */
  disconnect: () => void
}

/**
 * The observer options this patch passes.
 *
 * Spelled out as a named type so a test can assert the exact options object,
 * which is what pins the attribute filter that keeps the patch from observing
 * its own writes.
 */
interface MutationObserverOptions {
  readonly subtree: boolean
  readonly childList: boolean
  readonly characterData: boolean
  readonly attributes: boolean
  readonly attributeFilter: readonly string[]
}

/** The observer constructor, injected so the patch can run without a browser. */
export interface MutationObserverConstructor {
  new (callback: () => void): MutationObserverLike
}

/**
 * Watch the page for changes to the draft's decorations and keep the
 * plain-text marks in step.
 *
 * Marks are applied once up front, so a composer that already had a guessed
 * token when the plugin loaded is corrected without waiting for an edit.
 * @param document - the document to watch.
 * @param Observer - the observer constructor.
 * @returns a disposer that disconnects the watch and removes every mark.
 */
export function installDecorationWatch(
  document: ComposerDocumentLike,
  Observer: MutationObserverConstructor,
): Disposer {
  applyPlainTextMarks(document)

  let released = false
  const observer = new Observer(() => {
    // A callback can already be queued when the plugin unloads. Re-marking
    // then would write into a page this tweak no longer owns.
    if (released)
      return
    applyPlainTextMarks(document)
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    // Lexical replaces a text node's children when its content changes; a
    // character-data write is the other way the same edit can land.
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => {
    if (released)
      return
    released = true
    observer.disconnect()
    // The host's decorations stay exactly where they are; only the tweak's own
    // attribute goes, so the reference look returns with the plugin's absence.
    clearPlainTextMarks(document)
  }
}
