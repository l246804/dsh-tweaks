/**
 * Seam two: the DOM writes, against this plugin's own DOM stand-in.
 *
 * These tests drive the patch through the same `DocumentLike` surface the
 * browser's document satisfies, so the assertions are about anchors and marks,
 * not about a second implementation of the patch. The visual result, meaning
 * what the marked node actually looks like, is deliberately not asserted here;
 * that is the eye's job.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/marks
 */

import { describe, expect, it } from 'vitest'
import { attributeSelector } from '../../../src/client/dom/selector.ts'
import { applyPlainTextMarks, clearPlainTextMarks, PLAIN_TEXT_REF_MARKER } from '../../../src/client/features/reference-highlight/marks.ts'
import { createFakeDom } from '../../helpers/dom.ts'

const OPENABLE_CLASS = 'q44v1G_reference q44v1G_textRef q44v1G_openable'
const GUESSED_CLASS = 'q44v1G_reference q44v1G_textRef'
const TEXT_REF_SELECTOR = attributeSelector('data-composer-text-ref')
const MARKER_SELECTOR = attributeSelector(PLAIN_TEXT_REF_MARKER)

/**
 * Build a composer-shaped tree.
 * @param decorations - one entry per decoration: its text and class.
 * @returns the stand-in document plus the decoration elements in order.
 */
function composerWith(decorations: readonly { text: string, className?: string }[]) {
  const dom = createFakeDom()
  const input = dom.document.createElement('div')
  input.setAttribute('data-composer-input', '')
  dom.document.body.appendChild(input)
  const elements = decorations.map((decoration) => {
    const span = dom.document.createElement('span')
    span.setAttribute('data-composer-text-ref', '')
    if (decoration.className !== undefined)
      span.setAttribute('class', decoration.className)
    span.textContent = decoration.text
    input.appendChild(span)
    return span
  })
  return { document: dom.document, input, elements }
}

describe('marking the host’s guessed decorations', () => {
  it('marks the @ guesses and leaves everything else alone', () => {
    const { document, elements } = composerWith([
      { text: '@scope/', className: GUESSED_CLASS },
      { text: '@types/', className: GUESSED_CLASS },
      { text: '/plan', className: OPENABLE_CLASS },
    ])

    const marked = applyPlainTextMarks(document)

    expect(marked).toBe(2)
    expect(elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
    expect(elements[1]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
    // The `/` token the user picked keeps its reference look: no mark.
    expect(elements[2]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('never touches a chip, even one rendering the same text', () => {
    const dom = createFakeDom()
    const chip = dom.document.createElement('span')
    chip.setAttribute('data-composer-chip', 'file')
    chip.setAttribute('contenteditable', 'false')
    // A chip's inner portal subtree carries the shared `.reference` class, so
    // the anchor rather than the class is what keeps chips out of this patch.
    const inner = dom.document.createElement('span')
    inner.setAttribute('class', 'q44v1G_reference yAWgPa_chip')
    inner.textContent = '@scope/'
    chip.appendChild(inner)
    dom.document.body.appendChild(chip)

    expect(applyPlainTextMarks(dom.document)).toBe(0)
    expect(chip.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
    expect(inner.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('leaves the host’s own attributes on the node untouched', () => {
    const { document, elements } = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])
    const before = [...(elements[0]?.attributes ?? [])]

    applyPlainTextMarks(document)

    // Every host attribute is still there, byte for byte; the marker is the
    // only thing this tweak added.
    const after = new Map(elements[0]!.attributes)
    for (const [name, value] of before)
      expect(after.get(name)).toBe(value)
    expect([...after.keys()]).toEqual([...before.map(([name]) => name), PLAIN_TEXT_REF_MARKER])
    // The node itself stays put, so the editor's own DOM-to-node lookup and the
    // host's click-to-preview path are unaffected.
    expect(elements[0]?.textContent).toBe('@scope/')
  })

  it('is idempotent and self-correcting', () => {
    const { document, elements } = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])
    applyPlainTextMarks(document)
    applyPlainTextMarks(document)
    expect(document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(1)

    // The token grew into a lexicon hit the host calls openable: the host's
    // claim wins and the mark must come off.
    elements[0]?.setAttribute('class', OPENABLE_CLASS)
    expect(applyPlainTextMarks(document)).toBe(0)
    expect(elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('scans only the composer, not decorations rendered elsewhere', () => {
    const dom = createFakeDom()
    const transcript = dom.document.createElement('div')
    const rendered = dom.document.createElement('span')
    rendered.setAttribute('data-composer-text-ref', '')
    rendered.textContent = '@scope/'
    transcript.appendChild(rendered)
    dom.document.body.appendChild(transcript)

    const composer = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])

    expect(applyPlainTextMarks(composer.document)).toBe(1)
    expect(rendered.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
    expect(composer.elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
  })

  it('does nothing before a composer exists', () => {
    const dom = createFakeDom()
    expect(applyPlainTextMarks(dom.document)).toBe(0)
  })
})

describe('clearing this plugin’s marks', () => {
  it('removes every mark and nothing else', () => {
    const { document, elements } = composerWith([
      { text: '@scope/', className: GUESSED_CLASS },
      { text: '/plan', className: OPENABLE_CLASS },
    ])
    applyPlainTextMarks(document)

    clearPlainTextMarks(document)

    expect(document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0)
    // The host's decoration and its attributes survive, so the node still
    // previews on click exactly as before.
    expect(document.querySelectorAll(TEXT_REF_SELECTOR)).toHaveLength(2)
    expect(elements[0]?.getAttribute('data-composer-text-ref')).toBe('')
    expect(elements[0]?.textContent).toBe('@scope/')
    expect(elements[0]?.getAttribute('class')).toBe(GUESSED_CLASS)
  })

  it('is safe on a document it never touched', () => {
    const dom = createFakeDom()
    expect(() => clearPlainTextMarks(dom.document)).not.toThrow()
  })
})
