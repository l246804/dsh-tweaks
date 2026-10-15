/**
 * A panel tree whose rows and scroller report layout numbers.
 *
 * The shared DOM stand-in (`test/helpers/dom.ts`) has no layout engine, and its
 * own doc says why: the panel's structural work needs none. `reveal.ts` is the
 * exception. It reads four numbers off the scroller and the row and writes one
 * back, so the only way to test *it* rather than its arithmetic is a tree whose
 * nodes answer `offsetTop`, `offsetHeight`, `clientHeight`, `scrollHeight` and
 * `scrollTop`, which are the exact five properties the module reads and the
 * only geometry this helper invents.
 *
 * The nodes are the shared stand-in's, not a second DOM implementation, so the
 * selectors `revealRow` builds (`[data-dsh-tweaks-file-panel-scroll]`, then rows
 * by `[data-dsh-tweaks-files-path]`) run against the same DOM every other test uses.
 *
 * One property is modelled deliberately: **the scroller outlives a redraw**.
 * React keeps the element and patches its children, so its offset survives a
 * render, and a test that rebuilt the scroller on every draw could not tell "the
 * panel did not scroll" from "the scroller was thrown away". Here the scroller
 * is created on the first {@link MeasuredTree.draw} and kept, with its offset,
 * for every draw after it.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/measured-panel
 */

import type { FakeDom } from '../../helpers/dom.ts'
import type { FakeNode } from './fake-host-dom.ts'
import { PANEL_SCROLL_ATTRIBUTE, ROW_PATH_ATTRIBUTE } from '../../../src/client/features/file-panel/panel-host.ts'

/** The fixed shape one measured tree reports. */
export interface MeasuredTreeOptions {
  /** The stand-in document the panel's nodes are created from. */
  readonly document: FakeDom['document']
  /** The visible height the scroller reports. */
  readonly viewportHeight: number
  /** The height every row reports. */
  readonly rowHeight: number
  /** Blank space the list adds around its rows, as the panel's CSS padding does. */
  readonly padding?: number
}

/** A scroller that answers the layout questions `reveal.ts` asks. */
interface MeasuredScroller extends FakeNode {
  /** The visible height. */
  clientHeight: number
  /** The full content height of the rows last drawn. */
  scrollHeight: number
  /** The offset, read by `reveal.ts` and overwritten when it moves. */
  scrollTop: number
}

/** A tree that can be redrawn inside one container, the way React redraws one. */
export interface MeasuredTree {
  /** The scroller, once a draw created it. */
  readonly scroller: () => MeasuredScroller | undefined
  /** The rows of the last draw, by absolute path. */
  readonly rows: Map<string, FakeNode & { offsetTop: number, offsetHeight: number }>
  /**
   * Draw the given rows, replacing whatever the container held.
   *
   * The filter row above the scroller is part of the shape, so a reveal has to
   * find the scroller among siblings rather than as an only child.
   * @param container - the panel's container.
   * @param paths - the absolute paths to draw, in display order.
   */
  readonly draw: (container: FakeNode, paths: readonly string[]) => void
}

/**
 * Build a redrawable, measured tree.
 * @param options - the document and the numbers the panel reports.
 * @returns the tree's scroller, its rows, and the draw that replaces them.
 */
export function measuredTree(options: MeasuredTreeOptions): MeasuredTree {
  const { document } = options
  const padding = options.padding ?? 8
  const rows = new Map<string, FakeNode & { offsetTop: number, offsetHeight: number }>()
  let scroller: MeasuredScroller | undefined

  return {
    scroller: () => scroller,
    rows,
    draw(container, paths) {
      if (scroller === undefined) {
        // The filter row sits above the scroller in the panel's own markup.
        container.appendChild(document.createElement('div'))
        scroller = Object.assign(document.createElement('div'), {
          clientHeight: options.viewportHeight,
          scrollHeight: 0,
          scrollTop: 0,
        }) as MeasuredScroller
        scroller.setAttribute(PANEL_SCROLL_ATTRIBUTE, '')
        container.appendChild(scroller)
      }
      // Only the children are replaced: the scroller keeps its identity and its
      // offset, which is what makes "it did not scroll" an assertion about the
      // panel rather than about a throwaway node.
      for (const child of [...scroller.children])
        child.remove()
      rows.clear()
      const list = document.createElement('ul')
      scroller.appendChild(list)
      for (const [index, path] of paths.entries()) {
        // Nested one level, like the real tree's item inside a level list.
        const item = document.createElement('li')
        item.setAttribute(ROW_PATH_ATTRIBUTE, path)
        list.appendChild(item)
        rows.set(path, Object.assign(item, {
          offsetTop: padding + index * options.rowHeight,
          offsetHeight: options.rowHeight,
        }))
      }
      scroller.scrollHeight = 2 * padding + paths.length * options.rowHeight
    },
  }
}

/**
 * The one conversion this file makes.
 *
 * The stand-in has every member `revealRow` touches, but the shared helper is
 * deliberately typed as the plugin's own narrow `ElementLike` rather than the
 * browser's `Element`, so a test that wants the browser's type has to say so.
 * @param node - a node the shared stand-in created.
 * @returns the same node as the browser's `Element`.
 */
export function asElement(node: FakeNode): Element {
  const untyped: unknown = node
  return untyped as Element
}
