/**
 * The browser's own DOM and storage, behind the narrow faces the panel takes.
 *
 * Every other module in this feature is written against an injected `HostDom` /
 * `DocumentLike` / `PreferenceStorage`, which is what lets the whole thing be
 * driven from a plain Node test. This is the single place that reaches for the
 * real globals, so the casts a real document needs are stated once, with their
 * reason, instead of appearing at a dozen call sites.
 *
 * The casts exist because the browser's own types are *wider* than the plugin's
 * surface in two harmless directions: `parentNode` is `ParentNode | null` where
 * the plugin expects `Element | undefined`, and `querySelectorAll` returns a
 * `NodeListOf` rather than an iterable of the plugin's own `ElementLike`. Both
 * are the same value at runtime: a null parent is an absent one, and a
 * `NodeListOf` is iterable, so narrowing them here loses nothing.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/browser-dom
 */

import type { Disposer } from '../../effect.ts'
import type { HostDom } from './panel-host.ts'
import { STYLE_ELEMENT_MARKER } from '../../dom/markers.ts'

/**
 * Whether this program has a page to patch.
 *
 * The browser half only ever runs in a browser, but the module can still be
 * evaluated* without one: the artifact contract check loads the built bundle and
 * runs `apply` against a recording context, precisely so a bundle that only works
 * with a live page is caught before shipping. Upstream's own client kernel makes
 * the same distinction (`typeof document === 'undefined'` in
 * `packages/client/modules/src/client/system.ts`), and the honest answer here is
 * the same: with no document there is nothing to dock into and nothing to style,
 * so the plugin registers what it can and skips the page.
 * @returns whether a document exists.
 */
export function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

/**
 * The real DOM, as the panel's {@link HostDom}.
 * @returns the operations.
 */
export function createBrowserHostDom(): HostDom<Element> {
  return {
    createElement: tag => document.createElement(tag),
    append: (parent, child) => { parent.appendChild(child) },
    remove: (node) => { node.remove() },
    // A real node's parent is a `ParentNode`, which for an element's own child is
    // always an element; the plugin's surface says `Element | undefined`, so the
    // null and the union both collapse here.
    parentOf: node => (node.parentNode ?? undefined) as Element | undefined,
    childrenOf: node => [...node.children],
    setAttribute: (node, name, value) => { node.setAttribute(name, value) },
    removeAttribute: (node, name) => { node.removeAttribute(name) },
    getAttribute: (node, name) => node.getAttribute(name) ?? undefined,
    ancestorWith(node, attribute) {
      let current: Element | null = node.parentElement
      while (current !== null) {
        if (current.getAttribute(attribute) !== null)
          return current
        current = current.parentElement
      }
      return undefined
    },
  }
}

/**
 * Install the panel's stylesheet into the document head.
 *
 * Written here rather than reusing the shared `installStyles` so the narrow
 * `DocumentLike` cast stays in this file: the two are one operation, and having
 * the cast in a helper whose whole purpose is the cast is clearer than one that
 * appears to be about CSS injection. The marker attribute is the shared one, so
 * a test that looks for plugin-owned styles finds this element too.
 * @returns a disposer that detaches exactly this element.
 */
export function installPanelStyles(css: string): Disposer {
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

/**
 * Run `work` after the current task, when the shell's render has committed.
 *
 * A macrotask rather than a microtask: React's commit work for a click runs
 * inside the event's own task and in a microtask checkout, so a microtask here
 * could still observe the pre-render DOM. A `setTimeout(…, 0)` is after both.
 * @param work - the deferred work.
 * @returns a canceller for the pending call.
 */
export function deferToNextTask(work: () => void): () => void {
  const handle = setTimeout(work, 0)
  return () => {
    clearTimeout(handle)
  }
}
