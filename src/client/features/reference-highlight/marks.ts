/**
 * The DOM half of the tweak: mark the host's guessed decorations, and only them.
 *
 * The host derives a reference decoration from a syntax guess and gives it the
 * reference look (see `decision.ts` for the two sources and how they are told
 * apart). Nothing in that path is reachable from a plugin, so the tweak's only
 * lever is one attribute of its own on the host's own node. The stylesheet then
 * keys off that attribute, which is what makes the change look-only:
 *
 * - No node is added, removed or replaced, so the host's entity node keeps its
 *   element across edits (a property the host itself has a regression test for)
 *   and the editor's DOM-to-node lookup is unaffected.
 * - No host attribute is written or removed, so `data-composer-text-ref` and
 *   every other attribute stay exactly as rendered.
 * - The click path does not read any attribute or class this tweak touches: it
 *   resolves the node through Lexical's own DOM-to-node lookup and then tests
 *   `node instanceof TextRefNode` (upstream
 *   `input/editor/reference-activation.ts:25-31`). A token that really is a
 *   target therefore still previews.
 *
 * The anchor is `[data-composer-text-ref]`, never `[class*="_reference"]`: the
 * chip's inner portal span carries that same class (upstream
 * `input/editor/ReferenceChip.tsx:29` shares `composer-editor.module.css`'s
 * `.reference`), so a class anchor would restyle chips. The chip's host carries
 * `data-composer-chip` instead and is never selected here.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight/marks
 */

import type { DocumentLike, ElementLike } from '../../dom/types.ts'
import { attributeSelector } from '../../dom/selector.ts'
import { classifyReferenceDecoration } from './decision.ts'

/**
 * Marks a host decoration whose reference look this tweak takes away.
 *
 * The plugin's own attribute, so uninstalling is a query plus a
 * `removeAttribute` per match and the host's nodes are never touched.
 * `test/dom-lifecycle.test.ts` already pins the same convention for the
 * style element.
 */
export const PLAIN_TEXT_REF_MARKER = 'data-dsh-tweaks-plain-text-ref'

/**
 * The host's editable surface: the only subtree this tweak scans.
 *
 * There is exactly one of these on the page by design. The composer bar is one
 * `session-maybe` slot rendered unconditionally, and upstream states the
 * consequence where it renders it: a disabled bar is "one disabled textarea,
 * never a second tree" (upstream `skeleton/ConversationContent.tsx:141-145`), so
 * a session switch or a blocked state changes the bar's props rather than
 * mounting a second editable surface. Reading the composer with `querySelector`
 * therefore finds the whole of what this tweak must cover; a page-wide scan
 * would only reach decorations rendered outside the composer, which are the
 * transcript's and not this tweak's to restyle.
 */
const COMPOSER_INPUT_SELECTOR = attributeSelector('data-composer-input')

/** One host decoration, as this tweak sees it. */
const TEXT_REF_SELECTOR = attributeSelector('data-composer-text-ref')

/** The plugin's own marks, for clearing them. */
const MARKER_SELECTOR = attributeSelector(PLAIN_TEXT_REF_MARKER)

/**
 * Apply the marker to every decoration of the composer that should not look
 * like a reference, and take it off any that has become one.
 *
 * Only the attributes this tweak owns are written. A mark is recomputed from
 * the element's current text and class rather than remembered, so the pass is
 * idempotent and self-correcting after an arbitrary host re-render.
 * @param document - the document to patch.
 * @returns how many decorations carry the marker afterwards.
 */
export function applyPlainTextMarks(document: DocumentLike): number {
  const input = document.querySelector(COMPOSER_INPUT_SELECTOR)
  if (input === null)
    return 0

  const wanted = new Set<ElementLike>()
  for (const decoration of input.querySelectorAll(TEXT_REF_SELECTOR)) {
    const appearance = classifyReferenceDecoration({
      text: decoration.textContent,
      className: decoration.getAttribute('class'),
    })
    if (appearance === 'plain')
      wanted.add(decoration)
  }

  // Reconcile both directions: a node that no longer qualifies must lose its
  // mark, or a stale mark would keep overriding the host's styling.
  for (const marked of document.querySelectorAll(MARKER_SELECTOR)) {
    if (!wanted.has(marked))
      marked.removeAttribute(PLAIN_TEXT_REF_MARKER)
  }
  for (const decoration of wanted) {
    // Skip an unchanged write. An attribute write is itself an observable
    // change, so rewriting a correct mark would feed the watch its own output.
    if (decoration.getAttribute(PLAIN_TEXT_REF_MARKER) !== null)
      continue
    decoration.setAttribute(PLAIN_TEXT_REF_MARKER, '')
  }

  return wanted.size
}

/**
 * Take every mark this tweak wrote back off.
 *
 * Only the marker attribute is removed; the host's decoration, its attributes
 * and its position are untouched, so the composer renders exactly as it did
 * before the tweak loaded.
 * @param document - the document to clean.
 */
export function clearPlainTextMarks(document: DocumentLike): void {
  for (const marked of document.querySelectorAll(MARKER_SELECTOR))
    marked.removeAttribute(PLAIN_TEXT_REF_MARKER)
}
