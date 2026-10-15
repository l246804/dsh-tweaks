/**
 * Centring the active row: the arithmetic, and the one DOM read it needs.
 *
 * The rule the issue asks for is "the active row ends up in the middle of the
 * list, not pinned to an edge". As arithmetic that is one subtraction and a
 * clamp: the row's top minus half the leftover viewport, kept inside the
 * scrollable range.
 *
 * Everything that makes it hard is *timing* (only on a change, only after the
 * parent chain has settled), and that lives in `activation.ts` and the mount.
 * This file is the part that is true whenever it is called, which is why the
 * clamp is the interesting bit: the first row of a tree cannot be centred
 * (nothing above it) and the last cannot either (nothing below), so both must
 * land flush against the corresponding edge instead of at an offset a browser
 * would resolve inconsistently.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/reveal
 */

import { PANEL_SCROLL_ATTRIBUTE, ROW_PATH_ATTRIBUTE } from './panel-host.ts'
/** One row's place inside its scroller, and the scroller's shape. */
export interface ScrollMetrics {
  /** The row's top edge, relative to the scroller's content. */
  readonly rowTop: number
  /** The row's height. */
  readonly rowHeight: number
  /** The scroller's visible height. */
  readonly viewportHeight: number
  /** The scroller's full content height. */
  readonly scrollHeight: number
  /** The scroller's current offset. */
  readonly currentTop: number
}

/**
 * The offset that centres a row.
 *
 * Exported on its own because the arithmetic is the part a reader can check by
 * eye and a test can pin exactly, without any DOM.
 * @param metrics - the row's place and the scroller's shape.
 * @returns the offset to assign, always inside `[0, scrollHeight - viewportHeight]`.
 */
export function centredOffset(metrics: ScrollMetrics): number {
  const { rowTop, rowHeight, viewportHeight, scrollHeight } = metrics
  const wanted = rowTop - (viewportHeight - rowHeight) / 2
  // A scroller no taller than its viewport cannot move; `max` is where the last
  // full screenful begins.
  const max = Math.max(0, scrollHeight - viewportHeight)
  return Math.max(0, Math.min(max, wanted))
}

/**
 * Measure one row against its scroller.
 * @param scroller - the scrolling element.
 * @param row - the row inside it.
 * @returns the metrics {@link centredOffset} needs.
 */
function measureRow(scroller: HTMLElement, row: HTMLElement): ScrollMetrics {
  return {
    rowTop: row.offsetTop,
    rowHeight: row.offsetHeight,
    viewportHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
    currentTop: scroller.scrollTop,
  }
}

/**
 * Bring one file's row to the middle of the panel's scroller.
 *
 * A missing scroller or a row that is not on screen (its parent directory is
 * collapsed, or the filter hides it) is left alone: the caller re-decides on the
 * next state change, so a no-op here is a "not yet", not a failure. Assigning an
 * offset the scroller already has is also skipped, because doing so fires a
 * scroll event a renderer or a listener may be watching.
 * @param container - the panel's container element.
 * @param path - the absolute path of the row to centre.
 * @returns whether the scroller moved.
 */
export function revealRow(container: Element, path: string): boolean {
  const scroller = container.querySelector<HTMLElement>(`[${PANEL_SCROLL_ATTRIBUTE}]`)
  if (scroller === null)
    return false
  const row = findRow(scroller, path)
  if (row === null)
    return false
  const next = centredOffset(measureRow(scroller, row))
  if (next === scroller.scrollTop)
    return false
  scroller.scrollTop = next
  return true
}

/** The row element for one path, searched by the marker each row carries. */
function findRow(root: Element, path: string): HTMLElement | null {
  for (const candidate of root.querySelectorAll<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`)) {
    if (candidate.getAttribute(ROW_PATH_ATTRIBUTE) === path)
      return candidate
  }
  return null
}
