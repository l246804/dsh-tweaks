/**
 * Centring the active row: the arithmetic, and nothing else.
 *
 * The numbers in these cases are worked examples a reader can check, not values
 * recomputed the way the code does: a 100px viewport, 30px rows, and a row whose
 * top is known make the answer obvious by hand.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/reveal
 */

import { describe, expect, it } from 'vitest'
import { centredOffset } from '../../../src/client/features/file-panel/reveal.ts'

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
