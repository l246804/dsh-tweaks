/**
 * The drag's arithmetic, which is the half of the resize gesture the eye cannot
 * check.
 *
 * A drag is a stream of pointer positions, and every question worth asking about
 * it is a question about numbers: does moving the seam left make the panel
 * wider, does a proposal past the ceiling stop at it, does a double click land
 * on the default. Those are pinned here. What is *not* pinned is the handle's
 * size, its cursor, or the look of the grip it draws: that is the eye's job,
 * and a test asserting padding here would block the next person from adjusting
 * it (repo AGENTS.md, "UI edits are the ones the eye can check").
 *
 * The bounds themselves are `preferences.ts`'s and are tested there; what these
 * cases check is that this module goes *through* them rather than around them,
 * which is the mistake that would let a reader drag the panel to a width the
 * stylesheet then contradicts.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/resizer
 */

import type { ResizeDrag } from '../../../src/client/features/file-panel/resizer.ts'
import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  maxPanelWidth,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
} from '../../../src/client/features/file-panel/preferences.ts'
import {
  draggedWidth,
  PANEL_RESIZE_STEP,
  proposedWidth,
  resetWidth,
  steppedWidth,
} from '../../../src/client/features/file-panel/resizer.ts'

/** A drag in progress, as a test describes it. */
function drag(overrides: Partial<ResizeDrag> = {}): ResizeDrag {
  return {
    pointerId: 1,
    startX: 500,
    startWidth: 260,
    hostWidth: 1000,
    proposed: 260,
    ...overrides,
  }
}

describe('proposedWidth', () => {
  it('widens when the pointer moves left, because the seam is the panel’s left edge', () => {
    // 500 → 460 is 40px left, so the panel is 40px wider.
    expect(proposedWidth(drag(), 460)).toBe(300)
  })

  it('narrows when the pointer moves right', () => {
    expect(proposedWidth(drag(), 540)).toBe(220)
  })

  it('is unmoved when the pointer has not moved', () => {
    expect(proposedWidth(drag(), 500)).toBe(260)
  })
})

describe('draggedWidth', () => {
  it('stops at the floor, however far right the pointer goes', () => {
    // A 1000px host with a 180px floor: dragging right until the proposal is
    // negative must still answer the floor, not a negative width.
    expect(draggedWidth(drag(), 5000)).toBe(PANEL_MIN_WIDTH)
  })

  it('stops at half the host, however far left the pointer goes', () => {
    expect(draggedWidth(drag(), -5000)).toBe(500)
    expect(draggedWidth(drag(), -5000)).toBe(maxPanelWidth(1000))
  })

  it('follows the pointer between the bounds', () => {
    expect(draggedWidth(drag(), 400)).toBe(360)
  })

  it('measures against the host width the drag started with', () => {
    // The bounds are read once, at pointerdown: a host that reflowed mid-drag
    // must not move the ceiling under the reader's hand.
    expect(draggedWidth(drag({ hostWidth: 800 }), -5000)).toBe(400)
  })

  it('applies only the floor when the host was never measured', () => {
    // `hostWidth` of 0 is `clampPanelWidth`'s "not measured": the proposal
    // survives untouched, because a ceiling invented from an unread width would
    // shrink a legitimate preference.
    expect(draggedWidth(drag({ hostWidth: 0 }), 0)).toBe(760)
    expect(draggedWidth(drag({ hostWidth: 0 }), 5000)).toBe(PANEL_MIN_WIDTH)
  })

  it('never widens past the ceiling even from an already-oversized start', () => {
    const wide = drag({ startWidth: 900 })
    expect(draggedWidth(wide, 900)).toBe(500)
  })

  it('is exactly the preferences module’s clamp, not a second one', () => {
    for (const clientX of [0, 200, 400, 500, 700, 1200, 5000]) {
      const current = drag()
      expect(draggedWidth(current, clientX)).toBe(
        clampPanelWidth(proposedWidth(current, clientX), current.hostWidth),
      )
    }
  })
})

describe('steppedWidth', () => {
  it('widens by one step on ArrowLeft', () => {
    expect(steppedWidth(260, 'ArrowLeft', 1000)).toBe(260 + PANEL_RESIZE_STEP)
  })

  it('narrows by one step on ArrowRight', () => {
    expect(steppedWidth(260, 'ArrowRight', 1000)).toBe(260 - PANEL_RESIZE_STEP)
  })

  it('ignores every key that is not an arrow, so the event stays available', () => {
    expect(steppedWidth(260, 'ArrowUp', 1000)).toBeUndefined()
    expect(steppedWidth(260, 'Enter', 1000)).toBeUndefined()
    expect(steppedWidth(260, 'a', 1000)).toBeUndefined()
  })

  it('clamps a step that would cross either bound', () => {
    expect(steppedWidth(PANEL_MIN_WIDTH, 'ArrowRight', 1000)).toBe(PANEL_MIN_WIDTH)
    expect(steppedWidth(500, 'ArrowLeft', 1000)).toBe(500)
  })
})

describe('resetWidth', () => {
  it('is the default width in an ordinary pane', () => {
    expect(resetWidth(1000)).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('is still the default when the host was never measured', () => {
    expect(resetWidth(0)).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('never asks for more than half a pane too narrow to hold the default twice', () => {
    // 400px of host: the 50% ceiling is 200px, below the 260px default. The
    // reset has to respect the one bound the panel may never cross.
    expect(resetWidth(400)).toBe(200)
    expect(resetWidth(400)).toBe(maxPanelWidth(400))
  })

  it('is the same value a drag to the default would produce', () => {
    const current = drag({ startWidth: PANEL_DEFAULT_WIDTH })
    expect(resetWidth(current.hostWidth)).toBe(draggedWidth(current, current.startX))
  })
})
