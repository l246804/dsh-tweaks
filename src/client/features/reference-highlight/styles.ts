/**
 * The stylesheet that takes the reference look off a guessed decoration.
 *
 * The tweak's appearance change is one CSS rule, and where it points is the
 * whole risk. Three properties are deliberate:
 *
 * - It selects on two attributes: the host's `data-composer-text-ref` anchor and
 *   this plugin's own marker. Two attribute selectors (0,2,0) outweigh the
 *   host's `.reference` (0,1,0), so no `!important` is needed and a later host
 *   stylesheet is not being fought over.
 * - It never names a CSS-module class. The hash half changes per build, and the
 *   chip's inner span shares the stable `_reference` half, so a class anchor
 *   would be both brittle and a chip-styling bug. See `marks.ts` for the full
 *   anchor argument.
 * - It touches colour and background only. Padding, line height, display and
 *   box-decoration-break stay the host's, because those decide the text
 *   metrics the caret and the selection rectangles are computed from; changing
 *   them would be a layout change, not a colour change.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight/styles
 */

import { attributeSelector, compoundSelector } from '../../dom/selector.ts'
import { PLAIN_TEXT_REF_MARKER } from './marks.ts'

/**
 * The selector an un-referenced decoration is matched by.
 * @returns selector text such as `[data-composer-text-ref][data-dsh-tweaks-plain-text-ref]`.
 */
export function plainTextRefSelector(): string {
  return compoundSelector(
    attributeSelector('data-composer-text-ref'),
    attributeSelector(PLAIN_TEXT_REF_MARKER),
  )
}

/**
 * The stylesheet this feature installs.
 *
 * The host's reference treatment is `.reference` (a business-tinted colour, a
 * `0 4px` inset, and a tinted hover background) plus `.textRef`
 * (`display: inline-block; max-width: 100%`). Of those, the colour, the inset
 * and the hover tint are what make a token read as a reference, so all three
 * are reset here and the token renders as the text around it.
 *
 * The two `.textRef` properties deliberately stay. They decide how a long token
 * wraps and breaks, not how it is coloured, and resetting them would turn a
 * look-only change into a layout change.
 *
 * Both rules are anchored on the marked decoration alone, so a real reference
 * (a `/` token or a chip) is untouched. The hover rule is separate because a
 * pseudo-class carries more weight than the base rule, so the hover tint would
 * otherwise survive the reset above.
 * @returns the CSS text.
 */
export function referenceHighlightCss(): string {
  const anchor = plainTextRefSelector()
  return [
    '/* A hand-typed @ token is not a reference, so it drops the reference',
    '   treatment: colour, inset and the hover tint. Wrapping properties',
    '   (.textRef: display, max-width) stay, since they are layout, not look. */',
    `${anchor} {`,
    '  color: inherit;',
    '  padding: 0;',
    '}',
    `${anchor}:hover {`,
    '  background: transparent;',
    '}',
    '',
  ].join('\n')
}
