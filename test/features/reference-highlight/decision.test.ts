/**
 * Seam one: the classification itself, with no DOM at all.
 *
 * The tweak's whole judgement is one pure function taking the two facts a
 * decoration exposes to the page, its text and its class attribute, so every
 * shape the host can hand it is decided here and the DOM layer only has to
 * prove it read the anchors and wrote the marker.
 *
 * The expected values come from the host's own matcher, not from this plugin:
 * `scanTextRefs` derives a folder guess with `/(^|\s)(@(?:"[^"\n]*\/|[^\s"]+\/))/g`
 * (upstream `input/decorations.ts:25`), so a guessed decoration always starts
 * with `@` and always spans a separator. The `/` trigger's tokens come from the
 * lexicon branch instead, and only they carry the host's `<hash>_openable` class
 * (upstream `input/editor/text-ref.ts:55`).
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/decision
 */

import { describe, expect, it } from 'vitest'
import { classifyReferenceDecoration } from '../../../src/client/features/reference-highlight/decision.ts'

/** The host's class attribute for a `/`-triggered decoration. */
const OPENABLE_CLASS = 'q44v1G_reference q44v1G_textRef q44v1G_openable'
/** The host's class attribute for an `@`-triggered decoration. */
const GUESSED_CLASS = 'q44v1G_reference q44v1G_textRef'

describe('a hand-typed @ token is not a reference', () => {
  // Every row is a literal the host's folder matcher produces; the decoration's
  // text is the matched token, not the whole thing the user typed.
  it.each([
    ['@scope/', 'the whole token the user typed'],
    ['@types/', 'the truncated `@types/node` guess'],
    ['@a/', 'the truncated `@a/b` guess'],
    ['@src/components/', 'a multi-segment path'],
    ['@"some folder/', 'a quoted path'],
    ['@x/y/', 'the truncated `@x/y/z` guess'],
  ])('classifies %s as plain text', (text) => {
    expect(classifyReferenceDecoration({ text, className: GUESSED_CLASS })).toBe('plain')
  })

  it('does not restyle a decoration the folder matcher cannot produce', () => {
    // A bare `@name` has no separator, so the folder guess cannot match it; it
    // would only appear through a lexicon hit, which is a real reference.
    expect(classifyReferenceDecoration({ text: '@name', className: GUESSED_CLASS })).toBe('reference')
    expect(classifyReferenceDecoration({ text: '@', className: GUESSED_CLASS })).toBe('reference')
    expect(classifyReferenceDecoration({ text: '', className: GUESSED_CLASS })).toBe('reference')
  })
})

describe('the host’s own openable claim outranks the text shape', () => {
  it('keeps a decoration the host marked openable', () => {
    // `_openable` means the host decided this token names a target. If it ever
    // says so about an `@` token, that decision beats this plugin's reading.
    expect(classifyReferenceDecoration({ text: '@scope/', className: OPENABLE_CLASS })).toBe('reference')
  })

  it('reads the suffix as a whole class token, not a substring', () => {
    // A CSS-module name is `<hash>_<local>`; only the local part is knowable.
    // A longer local such as `_openableLater` is not the host's flag.
    expect(classifyReferenceDecoration({ text: '@scope/', className: 'h_reference h_openableLater' })).toBe('plain')
    expect(classifyReferenceDecoration({ text: '@scope/', className: 'openable' })).toBe('plain')
    expect(classifyReferenceDecoration({ text: '@scope/', className: null })).toBe('plain')
    expect(classifyReferenceDecoration({ text: '@scope/', className: undefined })).toBe('plain')
    expect(classifyReferenceDecoration({ text: '@scope/', className: '' })).toBe('plain')
  })
})

describe('the / trigger keeps its reference look', () => {
  it.each([
    '/plan',
    '/review',
    '/deploy',
  ])('keeps %s', (text) => {
    expect(classifyReferenceDecoration({ text, className: OPENABLE_CLASS })).toBe('reference')
  })

  it('keeps a slash token even if the host stops flagging it openable', () => {
    // The trigger character is the durable signal; the hashed suffix is not,
    // so the appearance must not hinge on the suffix alone.
    expect(classifyReferenceDecoration({ text: '/plan', className: GUESSED_CLASS })).toBe('reference')
  })

  it('ignores a slash that is not the trigger', () => {
    expect(classifyReferenceDecoration({ text: 'a/b', className: GUESSED_CLASS })).toBe('reference')
  })
})
