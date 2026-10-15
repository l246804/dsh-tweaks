/**
 * Seam three: the feature's entry, end to end against the stand-ins.
 *
 * `install` is what `src/client/index.ts` calls, so this is where "the tweak
 * installs, and uninstalling leaves nothing behind" is checked as a whole: the
 * observer, the stylesheet, the marks and the editor's own nodes are all
 * asserted from the page's side.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/install
 */

import { afterEach, describe, expect, it } from 'vitest'
import { STYLE_ELEMENT_MARKER } from '../../../src/client/dom/markers.ts'
import { attributeSelector } from '../../../src/client/dom/selector.ts'
import { install } from '../../../src/client/features/reference-highlight/index.ts'
import { PLAIN_TEXT_REF_MARKER } from '../../../src/client/features/reference-highlight/marks.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { createRecordingScope } from '../../helpers/scope.ts'
import { createRecordingObservers } from './recording-observer.ts'

const OPENABLE_CLASS = 'q44v1G_reference q44v1G_textRef q44v1G_openable'
const GUESSED_CLASS = 'q44v1G_reference q44v1G_textRef'
const MARKER_SELECTOR = attributeSelector(PLAIN_TEXT_REF_MARKER)
const TEXT_REF_SELECTOR = attributeSelector('data-composer-text-ref')

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/**
 * Build a page holding a composer with one guessed and one openable decoration,
 * plus a chip, and install the recorded globals the feature reads.
 * @returns the fixtures an assertion needs.
 */
function bench() {
  const dom = createFakeDom()
  const observers = createRecordingObservers()
  const restore = dom.install()
  const globals = globalThis as Record<string, unknown>
  // Swap in the recording observer so the test can deliver a change and see
  // whether the callback is still live.
  globals.MutationObserver = observers.MutationObserver
  cleanups.push(restore)

  const input = dom.document.createElement('div')
  input.setAttribute('data-composer-input', '')
  dom.document.body.appendChild(input)

  const guessed = dom.document.createElement('span')
  guessed.setAttribute('data-composer-text-ref', '')
  guessed.setAttribute('class', GUESSED_CLASS)
  guessed.textContent = '@scope/'
  input.appendChild(guessed)

  const openable = dom.document.createElement('span')
  openable.setAttribute('data-composer-text-ref', '')
  openable.setAttribute('class', OPENABLE_CLASS)
  openable.textContent = '/plan'
  input.appendChild(openable)

  const chip = dom.document.createElement('span')
  chip.setAttribute('data-composer-chip', 'file')
  chip.setAttribute('contenteditable', 'false')
  input.appendChild(chip)

  const scope = createRecordingScope()

  return { dom, observers, input, guessed, openable, chip, scope }
}

describe('installing the feature', () => {
  it('installs one labelled effect per resource it owns', () => {
    const { scope, dom } = bench()

    install(scope)

    // Every effect carries a label: an unlabelled one is invisible in the
    // host's effect diagnostics, which is how a leaked resource hides.
    expect(scope.labels.length).toBeGreaterThan(0)
    expect(scope.labels.every(label => label.length > 0)).toBe(true)
    expect(scope.labels.every(label => label.startsWith('dsh-tweaks: reference-highlight'))).toBe(true)
    expect(dom.document.querySelectorAll(attributeSelector(STYLE_ELEMENT_MARKER))).toHaveLength(1)
  })

  it('takes the reference look off the guess and leaves the picked tokens alone', () => {
    const { scope, guessed, openable, chip } = bench()

    install(scope)

    expect(guessed.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
    expect(openable.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
    // The chip is a different node with a different anchor: never marked.
    expect(chip.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })

  it('keeps the host’s node and attributes, so click-to-preview still resolves', () => {
    const { scope, guessed } = bench()

    install(scope)

    // The host's click path resolves through Lexical's own DOM-to-node lookup,
    // so the element must survive with its identity and its own attributes.
    expect(guessed.getAttribute('data-composer-text-ref')).toBe('')
    expect(guessed.getAttribute('class')).toBe(GUESSED_CLASS)
    expect(guessed.textContent).toBe('@scope/')
    expect(guessed.getAttribute('spellcheck')).toBeNull()
  })

  it('re-marks after a change delivered by the page', () => {
    const { scope, observers, input, dom } = bench()
    install(scope)

    const typed = dom.document.createElement('span')
    typed.setAttribute('data-composer-text-ref', '')
    typed.setAttribute('class', GUESSED_CLASS)
    typed.textContent = '@types/'
    input.appendChild(typed)
    observers.latest().deliver()

    expect(typed.getAttribute(PLAIN_TEXT_REF_MARKER)).toBe('')
  })

  it('does nothing when there is no document, so a non-browser run stays valid', () => {
    const scope = createRecordingScope()
    expect(() => install(scope)).not.toThrow()
    // No document to patch means no resource to own either: registering
    // effects that cannot do anything would only add noise to uninstall.
    expect(scope.pending()).toBe(0)
  })
})

describe('uninstalling the feature', () => {
  it('disconnects the watch, drops the stylesheet and clears every mark', () => {
    const { scope, dom, guessed, openable, chip } = bench()
    install(scope)
    expect(scope.pending()).toBeGreaterThan(0)

    scope.disposeAll()

    expect(scope.pending()).toBe(0)
    expect(dom.document.querySelectorAll(attributeSelector(STYLE_ELEMENT_MARKER))).toHaveLength(0)
    expect(dom.document.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0)
    // The host's own DOM is exactly as it was.
    expect(dom.document.querySelectorAll(TEXT_REF_SELECTOR)).toHaveLength(2)
    expect(guessed.getAttribute('class')).toBe(GUESSED_CLASS)
    expect(openable.getAttribute('class')).toBe(OPENABLE_CLASS)
    expect(chip.getAttribute('data-composer-chip')).toBe('file')
    expect(dom.document.head.descendants()).toHaveLength(0)
  })

  it('stops reacting to changes once disposed', () => {
    const { scope, observers, input, dom } = bench()
    install(scope)
    scope.disposeAll()

    const typed = dom.document.createElement('span')
    typed.setAttribute('data-composer-text-ref', '')
    typed.setAttribute('class', GUESSED_CLASS)
    typed.textContent = '@types/'
    input.appendChild(typed)
    observers.latest().deliver()

    expect(typed.getAttribute(PLAIN_TEXT_REF_MARKER)).toBeNull()
  })
})
