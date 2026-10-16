/**
 * Centring the active row: the arithmetic, and the one write it performs.
 *
 * The numbers in the arithmetic cases are worked examples a reader can check,
 * not values recomputed the way the code does: a 100px viewport, 30px rows, and
 * a row whose top is known make the answer obvious by hand.
 *
 * The second half is the half arithmetic alone cannot prove: that `revealRow`
 * measures the live scroller and row through the browser's own properties and
 * writes the centred offset back. Its evidence is a tree whose nodes report
 * geometry (`measured-panel.ts`), because the panel's own DOM stand-in
 * deliberately has none, so without that tree nothing tests the module at all.
 *
 * The third thing `revealRow` reports is *why* it did nothing, and the two
 * answers are told apart here: a row that is not on screen (`absent`) is a "try
 * again later" for the caller, while a row the scroller already holds
 * (`settled`) is finished business. The mount's retry rule reads that
 * difference, so a module that collapsed the two into `false` would leave it
 * guessing.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/reveal
 */

import { describe, expect, it } from 'vitest'
import { centredOffset, revealRow } from '../../../src/client/features/file-panel/reveal.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { asElement, measuredTree } from './measured-panel.ts'

/** A scroller 100px tall with 1000px of content, holding 30px rows. */
function scroller(overrides: Partial<Parameters<typeof centredOffset>[0]> = {}) {
  return {
    rowTop: 500,
    rowHeight: 30,
    viewportHeight: 100,
    scrollHeight: 1000,
    currentTop: 0,
    ...overrides,
  }
}

describe('centredOffset', () => {
  it('puts the row in the middle: 500 - (100 - 30) / 2 = 465', () => {
    expect(centredOffset(scroller())).toBe(465)
  })

  it('clamps at the top, so the first row does not ask for a negative offset', () => {
    expect(centredOffset(scroller({ rowTop: 10 }))).toBe(0)
  })

  it('clamps at the bottom, so the last row does not scroll past the content', () => {
    expect(centredOffset(scroller({ rowTop: 990 }))).toBe(900)
  })

  it('cannot move when the content is shorter than the viewport', () => {
    expect(centredOffset(scroller({ rowTop: 20, scrollHeight: 50 }))).toBe(0)
  })

  it('cannot move when the content is exactly the viewport height', () => {
    expect(centredOffset(scroller({ rowTop: 40, scrollHeight: 100 }))).toBe(0)
  })

  it('agrees with a row already centred', () => {
    // 465 puts a row at 500 with a 100px viewport in the middle.
    expect(centredOffset(scroller({ rowTop: 500, currentTop: 465 }))).toBe(465)
  })
})

/**
 * A 100px viewport over 38px rows inset by 8px, the shape the panel scrolls.
 *
 * The numbers below are all derived from these three by hand, so a case reads as
 * "row 20 sits at 768, and 768 - 31 = 737".
 */
const ROW_HEIGHT = 38
const PADDING = 8
const VIEWPORT = 100

/** The offset that centres the row at `index` in a tree of `count` rows. */
function centredFor(index: number, count: number): number {
  const rowTop = PADDING + index * ROW_HEIGHT
  const wanted = rowTop - (VIEWPORT - ROW_HEIGHT) / 2
  const max = Math.max(0, (2 * PADDING + count * ROW_HEIGHT) - VIEWPORT)
  return Math.max(0, Math.min(max, wanted))
}

/** 26 rows: enough that the middle of the tree is nowhere near either edge. */
const manyPaths = Array.from({ length: 26 }, (_unused, index) => `/w/row-${index}.ts`)

/** Draw a tree over its own container and hand both back. */
function panelTree(paths: readonly string[] = manyPaths) {
  const { document } = createFakeDom()
  const tree = measuredTree({ document, viewportHeight: VIEWPORT, rowHeight: ROW_HEIGHT, padding: PADDING })
  const container = document.createElement('div')
  tree.draw(container, paths)
  return { tree, container: asElement(container) }
}

describe('revealRow', () => {
  it('reads the live geometry and writes the centred offset back to the scroller', () => {
    const { tree, container } = panelTree()
    const target = manyPaths[20]!

    expect(revealRow(container, target)).toBe('centred')
    // Row 20 sits at 8 + 20 * 38 = 768; 768 - (100 - 38) / 2 = 737.
    expect(tree.scroller()?.scrollTop).toBe(737)
    expect(centredFor(20, manyPaths.length)).toBe(737)
  })

  it('does not pin the row to the top edge, which is what "centred" rules out', () => {
    const { tree, container } = panelTree()
    const rowTop = tree.rows.get(manyPaths[20]!)!.offsetTop

    revealRow(container, manyPaths[20]!)
    // A top-aligned reveal would land on the row's own top edge.
    expect(tree.scroller()?.scrollTop).not.toBe(rowTop)
    expect(tree.scroller()?.scrollTop).toBeLessThan(rowTop)
    // Half the leftover viewport is left above the row, and the rest below.
    expect(rowTop - tree.scroller()!.scrollTop).toBe((VIEWPORT - ROW_HEIGHT) / 2)
  })

  it('clamps a row near the top flush against the top rather than above it', () => {
    const { tree, container } = panelTree(['/w/a.ts', '/w/b.ts'])
    // A reveal is the only thing that moves it; start it away from the top so a
    // no-op cannot be mistaken for a successful clamp.
    tree.scroller()!.scrollTop = 300

    expect(revealRow(container, '/w/a.ts')).toBe('centred')
    expect(tree.scroller()?.scrollTop).toBe(0)
  })

  it('clamps the last row so a reveal never scrolls past the content', () => {
    const { tree, container } = panelTree()
    // The last row wants 958 - 31 = 927, but the scroller's range ends at 904.
    expect(revealRow(container, manyPaths.at(-1)!)).toBe('centred')
    expect(tree.scroller()?.scrollTop).toBe(904)
    expect(tree.scroller()!.scrollTop).toBe(tree.scroller()!.scrollHeight - VIEWPORT)
  })

  it('leaves a scroller that already holds the offset alone, so no scroll event fires', () => {
    const writes: number[] = []
    const { tree, container } = panelTree()
    const scroller = tree.scroller()!
    let held = scroller.scrollTop
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => held,
      set: (value: number) => {
        writes.push(value)
        held = value
      },
    })
    const target = manyPaths[20]!

    // A row whose offset differs is written once...
    expect(revealRow(container, target)).toBe('centred')
    expect(writes).toHaveLength(1)
    // ...and asking again for the offset the scroller now holds writes nothing.
    expect(revealRow(container, target)).toBe('settled')
    expect(writes).toHaveLength(1)
  })

  it('does nothing when the panel has no scroller yet', () => {
    const { document } = createFakeDom()
    const container = document.createElement('div')
    expect(revealRow(asElement(container), '/w/a.ts')).toBe('absent')
  })

  it('does nothing for a row that is not on screen, such as one under a collapsed directory', () => {
    const { tree, container } = panelTree(['/w/a.ts'])
    tree.scroller()!.scrollTop = 250

    expect(revealRow(container, '/w/hidden.ts')).toBe('absent')
    expect(tree.scroller()?.scrollTop).toBe(250)
  })

  it('tells "the row is not there yet" apart from "the row is already centred"', () => {
    const { tree, container } = panelTree()
    const target = manyPaths[20]!

    // Both leave the scroller where it is, and only one of them means the caller
    // is done. The mount retries on the first and stops on the second, so the two
    // answers must not be the same value.
    expect(revealRow(container, '/w/not-drawn.ts')).toBe('absent')
    revealRow(container, target)
    expect(revealRow(container, target)).toBe('settled')
    // A scroller that cannot move at all is still "the row is there": the reveal
    // found it and centring it happened to be a no-op, which is settled business.
    const short = panelTree(['/w/only.ts'])
    expect(revealRow(short.container, '/w/only.ts')).toBe('settled')
    expect(tree.scroller()?.scrollTop).not.toBe(short.tree.scroller()?.scrollTop)
  })

  it('finds a row deep in the tree by its path, not by position', () => {
    const { document } = createFakeDom()
    const tree = measuredTree({ document, viewportHeight: VIEWPORT, rowHeight: ROW_HEIGHT, padding: PADDING })
    const container = document.createElement('div')
    // Two rows with the same trailing name, the deeper one drawn first, plus
    // enough filler that the scroller can actually move.
    const paths = ['/w/deep/a.ts', '/w/src/a.ts', ...manyPaths]
    tree.draw(container, paths)

    expect(revealRow(asElement(container), '/w/src/a.ts')).toBe('centred')
    // The second row's own place (8 + 38 = 46), not the first's: 46 - 31 = 15.
    expect(tree.scroller()?.scrollTop).toBe(15)
  })
})
