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
import { DOCKKIT_ANCHORS } from '../src/client/dom/host-anchors.ts'
import { attributeSelector, compoundSelector, escapeAttributeValue } from '../src/client/dom/selector.ts'

describe('selector construction', () => {
  it('builds a presence selector from an attribute name', () => {
    // 属性名取自锚点常量：这条测的是方括号的拼装，不是某个具体拼写。
    expect(attributeSelector(DOCKKIT_ANCHORS.host.name)).toBe(`[${DOCKKIT_ANCHORS.host.name}]`)
  })

  it('builds an exact-value selector, quoting the value', () => {
    expect(attributeSelector(DOCKKIT_ANCHORS.tab.name, '4:user')).toBe(`[${DOCKKIT_ANCHORS.tab.name}="4:user"]`)
  })

  it('joins parts into one compound selector', () => {
    expect(compoundSelector(attributeSelector('data-x'), attributeSelector('data-y')))
      .toBe('[data-x][data-y]')
  })

  it('escapes the characters that would end or break a selector string', () => {
    expect(escapeAttributeValue('a"b\\c')).toBe('a\\22 b\\5c c')
    expect(attributeSelector('data-x', 'a"b')).toBe('[data-x="a\\22 b"]')
  })

  it('rejects an empty attribute name or an empty compound', () => {
    expect(() => attributeSelector('')).toThrow(/must not be empty/)
    expect(() => compoundSelector()).toThrow(/at least one part/)
  })
})
