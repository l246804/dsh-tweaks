/**
 * Seam two, continued: the change watch.
 *
 * A decoration is derived, not stored: the host re-derives it whenever the
 * draft's text changes, with no event a plugin can subscribe to. So the tweak
 * has to notice the page changing and recompute its marks. These tests assert
 * what it watches, that a delivered change re-marks, and that releasing the
 * watch disconnects the observer and takes the marks off.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/watch
 */

import { describe, expect, it } from 'vitest'
import { attributeSelector } from '../../../src/client/dom/selector.ts'
import { PLAIN_TEXT_REF_MARKER } from '../../../src/client/features/reference-highlight/marks.ts'
import { installDecorationWatch } from '../../../src/client/features/reference-highlight/watch.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { createRecordingObservers } from './recording-observer.ts'

const OPENABLE_CLASS = 'q44v1G_reference q44v1G_textRef q44v1G_openable'
const GUESSED_CLASS = 'q44v1G_reference q44v1G_textRef'
const MARKER_SELECTOR = attributeSelector(PLAIN_TEXT_REF_MARKER)

/**
 * Build a composer containing the given decorations (text plus class).
 * @param decorations - one entry per decoration.
 * @returns the stand-in document and its decoration elements.
 */
function composerWith(decorations: readonly { text: string, className: string }[]) {
  const dom = createFakeDom()
  const input = dom.document.createElement('div')
  input.setAttribute('data-composer-input', '')
  dom.document.body.appendChild(input)
  const elements = decorations.map((decoration) => {
    const span = dom.document.createElement('span')
    span.setAttribute('data-composer-text-ref', '')
    span.setAttribute('class', decoration.className)
    span.textContent = decoration.text
    input.appendChild(span)
    return span
  })
  return { document: dom.document, input, elements }
}

describe('installing the watch', () => {
  it('observes the page root, so a replaced composer is still covered', () => {
    const { document } = composerWith([])
    const observers = createRecordingObservers()

    installDecorationWatch(document, observers.MutationObserver)

    const [observer] = observers.created
    expect(observer?.observations).toHaveLength(1)
    // The composer element is remounted per session; the page root is not, so
    // anchoring here is what keeps the watch alive across a session switch.
    expect(observer?.observations[0]?.target).toBe(document.documentElement)
    expect(observer?.observations[0]?.options).toEqual({
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      // Filtered to the host's own class: this plugin's marker is a different
      // attribute, so its own writes cannot re-enter the callback.
      attributeFilter: ['class'],
    })
  })

  it('marks what is already there before watching', () => {
    const { document, elements } = composerWith([
      { text: '@scope/', className: GUESSED_CLASS },
      { text: '/plan', className: OPENABLE_CLASS },
    ])
    const observers = createRecordingObservers()

    installDecorationWatch(document, observers.MutationObserver)

    expect(elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
    expect(elements[1]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('re-marks when a delivered change brings a new guess in', () => {
    const { document, input } = composerWith([])
    const observers = createRecordingObservers()
    installDecorationWatch(document, observers.MutationObserver)

    const typed = document.createElement('span')
    typed.setAttribute('data-composer-text-ref', '')
    typed.setAttribute('class', GUESSED_CLASS)
    typed.textContent = '@types/'
    input.appendChild(typed)
    observers.latest().deliver()

    expect(typed.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
  })

  it('takes a mark off when the host re-derives the token as openable', () => {
    const { document, elements } = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])
    const observers = createRecordingObservers()
    installDecorationWatch(document, observers.MutationObserver)
    expect(elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')

    elements[0]?.setAttribute('class', OPENABLE_CLASS)
    observers.latest().deliver()

    expect(elements[0]?.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('does not rewrite a mark that is already correct', () => {
    // An attribute write is itself a page change. Rewriting an unchanged mark
    // would make the callback queue another callback for as long as the draft
    // is edited.
    const { document, elements } = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])
    const observers = createRecordingObservers()
    installDecorationWatch(document, observers.MutationObserver)

    const decoration = elements[0]!
    let writes = 0
    const set = decoration.setAttribute.bind(decoration)
    decoration.setAttribute = (name, value) => {
      writes += 1
      set(name, value)
    }

    observers.latest().deliver()
    observers.latest().deliver()

    expect(writes).toBe(0)
  })

  it('survives a change with no composer on the page', () => {
    const dom = createFakeDom()
    const observers = createRecordingObservers()
    installDecorationWatch(dom.document, observers.MutationObserver)

    expect(() => observers.latest().deliver()).not.toThrow()
  })
})

describe('releasing the watch', () => {
  it('disconnects the observer and clears every mark', () => {
    const { document, elements } = composerWith([
      { text: '@scope/', className: GUESSED_CLASS },
      { text: '@types/', className: GUESSED_CLASS },
    ])
    const observers = createRecordingObservers()
    const release = installDecorationWatch(document, observers.MutationObserver)
    expect(document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(2)

    release()

    expect(observers.latest().isConnected()).toBe(false)
    expect(observers.latest().disconnects).toBe(1)
    expect(document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0)
    // The host's decorations are untouched: they come back to the reference
    // look the moment the tweak is gone.
    expect(document.querySelectorAll(attributeSelector('data-composer-text-ref'))).toHaveLength(2)
    expect(elements[0]?.getAttribute('data-composer-text-ref')).toBe('')
  })

  it('is idempotent, so a scope disposal and an explicit release cannot double-run', () => {
    const { document } = composerWith([{ text: '@scope/', className: GUESSED_CLASS }])
    const observers = createRecordingObservers()
    const release = installDecorationWatch(document, observers.MutationObserver)

    release()
    release()

    expect(observers.latest().disconnects).toBe(1)
    // A change delivered after release must not reach the callback.
    observers.latest().deliver()
    expect(document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0)
  })
})
