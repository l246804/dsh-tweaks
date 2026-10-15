/**
 * Plugin-owned stylesheet installation. `DocumentLike` comes from the narrow DOM
 * surface so the same code runs in the browser and in tests.
 */
import type { Disposer } from '../effect.ts'
import type { DocumentLike } from './types.ts'
import { STYLE_ELEMENT_MARKER } from './markers.ts'

/**
 * Install one plugin-owned stylesheet into the document head.
 *
 * The style element carries {@link STYLE_ELEMENT_MARKER}, so removing the
 * plugin's CSS is a marker query rather than a search through every stylesheet
 * the page has. The returned disposer detaches exactly this element, leaving any
 * other element with the same marker alone.
 * @param document - the document to install into.
 * @param css - the stylesheet text.
 * @returns a disposer that detaches the style element.
 */
export function installStyles(document: DocumentLike, css: string): Disposer {
  const style = document.createElement('style')
  style.setAttribute(STYLE_ELEMENT_MARKER, '')
  style.textContent = css
  document.head.appendChild(style)
  let released = false
  return () => {
    if (released)
      return
    released = true
    style.remove()
  }
}
