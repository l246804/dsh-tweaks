/**
 * Seam one: pure decision functions, no DOM.
 *
 * The plugin's DOM patches are thin. Everything that can be decided from data
 * alone is decided in a pure module and checked here, so the DOM layer only has
 * to prove it read and wrote the right anchors.
 *
 * @module @leiwang2000/dsh-tweaks/test/dom-selector
 */

import { describe, expect, it } from 'vitest'
import { attributeName, datasetKey } from '../src/client/dom/dataset.ts'
import { attributeContainsSelector, attributeSelector, compoundSelector, escapeAttributeValue } from '../src/client/dom/selector.ts'

describe('selector construction', () => {
  it('builds a presence selector from an attribute name', () => {
    expect(attributeSelector('data-composer-text-ref')).toBe('[data-composer-text-ref]')
  })

  it('builds an exact-value selector, quoting the value', () => {
    expect(attributeSelector('data-dockkit-tab', '4:user')).toBe('[data-dockkit-tab="4:user"]')
  })

  it('builds a substring selector for a hashed class suffix', () => {
    expect(attributeContainsSelector('class', '_openable')).toBe('[class*="_openable"]')
  })

  it('joins parts into one compound selector', () => {
    expect(compoundSelector(attributeSelector('data-x'), attributeContainsSelector('class', '_openable')))
      .toBe('[data-x][class*="_openable"]')
  })

  it('escapes the characters that would end or break a selector string', () => {
    expect(escapeAttributeValue('a"b\\c')).toBe('a\\22 b\\5c c')
    expect(attributeSelector('data-x', 'a"b')).toBe('[data-x="a\\22 b"]')
  })

  it('rejects an empty attribute name or fragment', () => {
    expect(() => attributeSelector('')).toThrow(/must not be empty/)
    expect(() => attributeContainsSelector('class', '')).toThrow(/must not be empty/)
    expect(() => compoundSelector()).toThrow(/at least one part/)
  })
})

describe('dataset key mapping', () => {
  it('maps an attribute name to its dataset key, both ways', () => {
    expect(datasetKey('data-dsh-tweaks-panel')).toBe('dshTweaksPanel')
    expect(attributeName('dshTweaksPanel')).toBe('data-dsh-tweaks-panel')
  })

  it('round-trips a single-word attribute', () => {
    expect(attributeName(datasetKey('data-plain'))).toBe('data-plain')
  })

  it('rejects names outside its domain', () => {
    expect(() => datasetKey('class')).toThrow(/not a data-\* attribute/)
    expect(() => attributeName('')).toThrow(/must not be empty/)
    expect(() => attributeName('data-already')).toThrow(/already an attribute name/)
  })
})
