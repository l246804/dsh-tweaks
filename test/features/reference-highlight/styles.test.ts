/**
 * Seam one, continued: what the stylesheet rule is anchored on.
 *
 * The declarations themselves are the look, and the look is the eye's job: a
 * test that pinned `color` or `padding` would block the next person from
 * adjusting them. What is not the eye's job is *which element* the rule can
 * reach, because a wrong anchor here means restyling chips or fighting the
 * host's own stylesheet with `!important`. That is what these tests pin.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/styles
 */

import { describe, expect, it } from 'vitest'
import { PLAIN_TEXT_REF_MARKER } from '../../../src/client/features/reference-highlight/marks.ts'
import { plainTextRefSelector, referenceHighlightCss } from '../../../src/client/features/reference-highlight/styles.ts'

describe('the override’s anchor', () => {
  it('pairs the plugin’s marker with the host’s decoration attribute', () => {
    // Two attributes, so the rule outweighs the host's single `.reference`
    // class without `!important`; the marker keeps it the plugin's own node.
    expect(plainTextRefSelector()).toBe(`[data-composer-text-ref][${PLAIN_TEXT_REF_MARKER}]`)
  })

  it('never anchors on a hashed CSS-module class', () => {
    // A chip's inner portal span shares `_reference` with the decoration, so a
    // class anchor would restyle chips; and the hash half changes every build.
    const selector = plainTextRefSelector()
    expect(selector).not.toContain('_reference')
    expect(selector).not.toContain('class')
  })

  it('writes no rule for the chip at all', () => {
    expect(referenceHighlightCss()).not.toContain('data-composer-chip')
  })

  it('does not reach for `!important` to win', () => {
    // The weight comes from the anchor, not from an escalation: a marked
    // decoration must lose to whatever the host changes next, not outrank it.
    expect(referenceHighlightCss()).not.toContain('!important')
  })
})

describe('the rule as CSS', () => {
  it('is non-empty and closes every block it opens', () => {
    // The stylesheet is text handed to the host's document; a truncated one
    // would silently swallow the rule after the break.
    const css = referenceHighlightCss()
    const opens = css.split('{').length - 1
    const closes = css.split('}').length - 1
    expect(opens).toBeGreaterThan(0)
    expect(opens).toBe(closes)
  })

  it('carries the selector it was built from', () => {
    expect(referenceHighlightCss()).toContain(plainTextRefSelector())
  })
})
