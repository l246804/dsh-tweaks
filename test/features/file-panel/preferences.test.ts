/**
 * The panel's remembered preferences, including the browsers that refuse to
 * have any, and the two bounds on the width a reader can drag.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/preferences
 */

import type { PreferenceStorage } from '../../../src/client/features/file-panel/preferences.ts'
import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  maxPanelWidth,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  PREFERENCE_KEY,
  readVisiblePreference,
  readWidthPreference,
  WIDTH_PREFERENCE_KEY,
  writeVisiblePreference,
  writeWidthPreference,
} from '../../../src/client/features/file-panel/preferences.ts'

/** An in-memory store that records what was written. */
function store(initial: Record<string, string> = {}): PreferenceStorage & { readonly entries: Record<string, string> } {
  const entries = { ...initial }
  return {
    entries,
    getItem: key => entries[key] ?? null,
    setItem: (key, value) => { entries[key] = value },
  }
}

describe('readVisiblePreference', () => {
  it('is on when nothing was ever chosen, which is the documented default', () => {
    expect(readVisiblePreference(store())).toBe(true)
  })

  it('is on when there is no storage at all', () => {
    expect(readVisiblePreference(undefined)).toBe(true)
  })

  it('remembers the reader turning it off', () => {
    expect(readVisiblePreference(store({ [PREFERENCE_KEY]: 'false' }))).toBe(false)
  })

  it('treats a value it cannot make sense of as the default, not as "off"', () => {
    expect(readVisiblePreference(store({ [PREFERENCE_KEY]: 'yes' }))).toBe(true)
  })

  it('degrades to the default when storage refuses to be read', () => {
    const hostile: PreferenceStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => {},
    }
    expect(readVisiblePreference(hostile)).toBe(true)
  })
})

describe('writeVisiblePreference', () => {
  it('round-trips both answers through the same key', () => {
    const storage = store()
    writeVisiblePreference(storage, false)
    expect(storage.entries[PREFERENCE_KEY]).toBe('false')
    expect(readVisiblePreference(storage)).toBe(false)

    writeVisiblePreference(storage, true)
    expect(readVisiblePreference(storage)).toBe(true)
  })

  it('does nothing without a store', () => {
    expect(() => writeVisiblePreference(undefined, false)).not.toThrow()
  })

  it('swallows a store that refuses to be written', () => {
    const hostile: PreferenceStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
    }
    expect(() => writeVisiblePreference(hostile, false)).not.toThrow()
  })
})

describe('the width bounds', () => {
  it('caps the panel at half a measured body', () => {
    expect(maxPanelWidth(1000)).toBe(500)
    expect(maxPanelWidth(800)).toBe(400)
  })

  it('keeps the floor as the ceiling when the body is too narrow for two columns', () => {
    // A body narrower than twice the floor has no legal half; the floor is the
    // honest answer, and the panel overflows rather than collapsing.
    expect(maxPanelWidth(300)).toBe(PANEL_MIN_WIDTH)
    expect(maxPanelWidth(0)).toBe(PANEL_MIN_WIDTH)
  })

  it('clamps a width up to the floor and down to the measured ceiling', () => {
    expect(clampPanelWidth(40, 1000)).toBe(PANEL_MIN_WIDTH)
    expect(clampPanelWidth(900, 1000)).toBe(500)
    expect(clampPanelWidth(420, 1000)).toBe(420)
  })

  it('applies only the floor while the body has not been measured', () => {
    // An unmeasured body must not invent a ceiling: doing so would shrink a
    // legitimate preference to a fraction of zero.
    expect(clampPanelWidth(900, 0)).toBe(900)
    expect(clampPanelWidth(40, 0)).toBe(PANEL_MIN_WIDTH)
  })

  it('answers the default for a width that is not a finite number', () => {
    // A corrupted store must not reach CSS as `NaN`, which would collapse the panel.
    expect(clampPanelWidth(Number.NaN, 1000)).toBe(PANEL_DEFAULT_WIDTH)
    expect(clampPanelWidth(Number.POSITIVE_INFINITY, 1000)).toBe(PANEL_DEFAULT_WIDTH)
  })
})

describe('the stored width', () => {
  it('answers the default when nothing was ever stored', () => {
    expect(readWidthPreference(store())).toBe(PANEL_DEFAULT_WIDTH)
    expect(readWidthPreference(undefined)).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('round-trips a width through its own key', () => {
    const storage = store()
    writeWidthPreference(storage, 333)
    expect(storage.entries[WIDTH_PREFERENCE_KEY]).toBe('333')
    expect(readWidthPreference(storage)).toBe(333)
  })

  it('raises a stored width below the floor, and keeps one above it', () => {
    // The floor is the only bound a stored value can be judged against without a
    // measurement, and a stored width above it is the reader's own choice.
    expect(readWidthPreference(store({ [WIDTH_PREFERENCE_KEY]: '20' }))).toBe(PANEL_MIN_WIDTH)
    expect(readWidthPreference(store({ [WIDTH_PREFERENCE_KEY]: '900' }))).toBe(900)
  })

  it('treats an unparseable stored value as the default', () => {
    expect(readWidthPreference(store({ [WIDTH_PREFERENCE_KEY]: 'wide' }))).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('degrades to the default when storage refuses to be read', () => {
    const hostile: PreferenceStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => {},
    }
    expect(readWidthPreference(hostile)).toBe(PANEL_DEFAULT_WIDTH)
  })

  it('does not write a width that is not a number', () => {
    const storage = store()
    writeWidthPreference(storage, Number.NaN)
    expect(storage.entries[WIDTH_PREFERENCE_KEY]).toBeUndefined()
  })

  it('does nothing without a store, and swallows one that refuses to be written', () => {
    expect(() => writeWidthPreference(undefined, 300)).not.toThrow()
    const hostile: PreferenceStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
    }
    expect(() => writeWidthPreference(hostile, 300)).not.toThrow()
  })
})
