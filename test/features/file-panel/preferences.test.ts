/**
 * The panel's remembered preferences, including the browsers that refuse to
 * have any.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/preferences
 */

import type { PreferenceStorage } from '../../../src/client/features/file-panel/preferences.ts'
import { describe, expect, it } from 'vitest'
import {
  PREFERENCE_KEY,
  readVisiblePreference,
  writeVisiblePreference,
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
