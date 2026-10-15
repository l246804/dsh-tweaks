/**
 * Seam eight: what the row tells the user after a copy.
 *
 * The ticket's rule is that a degraded copy must be *said*, not swallowed. The
 * text for each outcome is a pure function of the outcome and the dictionary,
 * which is what makes "every degradation has words" a checkable claim rather
 * than a promise, the alternative is a switch that quietly returns nothing for
 * a case nobody wired up.
 *
 * What is asserted here is that *mapping*, never the sentences themselves. The
 * wording is copy, the part of this feature an eye checks, and `AGENTS.md` is
 * explicit that copy must not be gated on a test. So the tests below pin the
 * properties a mapping can get wrong while a human keeps ownership of the
 * prose: which outcome asks for which key, that the two languages differ, that
 * neither dictionary is empty, and that nothing is returned when there is
 * nothing to say.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/notice
 */

import type { MessageCopyKey } from '../../../src/client/features/message-copy/locales.ts'
import { describe, expect, it, vi } from 'vitest'
import { en, NS, zh } from '../../../src/client/features/message-copy/locales.ts'
import { noticeText } from '../../../src/client/features/message-copy/notice.ts'

/** A translate seat over one dictionary, as the locale service provides. */
function translate(dictionary: Record<string, string>) {
  return (key: string, params?: Record<string, unknown>): string => {
    const template = dictionary[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/gu, (match, name: string) => name in params ? String(params[name]) : match)
  }
}

const EN = translate(en)
const ZH = translate(zh)

describe('notice copy', () => {
  it('says nothing when the copy landed with everything', () => {
    expect(noticeText({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 }, EN)).toBeUndefined()
    expect(noticeText({ status: 'copied', attachmentsIncluded: true, omittedImages: 0 }, EN)).toBeUndefined()
  })

  it('explains an unsupported host by asking for the skipped-attachments key', () => {
    // A seam, not a sentence: the translate seat is observed, so this fails if
    // the mapping changes without the copy changing with it.
    const t = vi.fn(EN)

    const notice = noticeText({ status: 'text-only', reason: 'unsupported' }, t)

    expect(t).toHaveBeenCalledWith('copy.attachmentsSkipped')
    expect(notice).toBeDefined()
  })

  it('explains a refused write through the same key, since the row cannot act differently', () => {
    const t = vi.fn(EN)

    const notice = noticeText({ status: 'text-only', reason: 'denied' }, t)

    // Both reasons render one message on purpose: `notice.ts` maps the two to
    // one key, and a test that demanded a distinct sentence per reason would be
    // dictating copy rather than checking behaviour.
    expect(t).toHaveBeenCalledWith('copy.attachmentsSkipped')
    expect(notice).toBeDefined()
  })

  it('explains a total failure instead of staying silent, through the failure key', () => {
    const t = vi.fn(EN)

    const notice = noticeText({ status: 'failed' }, t)

    expect(t).toHaveBeenCalledWith('copy.failed')
    expect(notice).toBeDefined()
  })

  it('counts the images the clipboard could not hold, while reporting the copy as landed', () => {
    const t = vi.fn(EN)

    const notice = noticeText({ status: 'copied', attachmentsIncluded: true, omittedImages: 2 }, t)

    // The count reaches the translate seat as a parameter, which is the logic
    // worth pinning: the sentence that interpolates it is copy.
    expect(t).toHaveBeenCalledWith('copy.imagesOmitted', { count: 2 })
    expect(notice).toBeDefined()
  })

  it('mentions an omitted image even when only one was left out', () => {
    const t = vi.fn(ZH)

    const notice = noticeText({ status: 'copied', attachmentsIncluded: true, omittedImages: 1 }, t)

    expect(t).toHaveBeenCalledWith('copy.imagesOmitted', { count: 1 })
    expect(notice).toBeDefined()
  })

  it('answers with copy for every non-landed outcome, so no case is wordless', () => {
    const outcomes = [
      { status: 'text-only', reason: 'unsupported' },
      { status: 'text-only', reason: 'denied' },
      { status: 'failed' },
      { status: 'copied', attachmentsIncluded: true, omittedImages: 3 },
    ] as const

    for (const outcome of outcomes) {
      for (const dictionary of [EN, ZH]) {
        const notice = noticeText(outcome, dictionary)
        expect(typeof notice).toBe('string')
        expect(notice?.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the two dictionaries in step, key for key', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('dshTweaksMessageCopy')
    // Every key the notice can ask for exists in both, and the two say
    // something different: a dictionary that fell back to the other language
    // would pass a non-empty check while showing a reader the wrong one.
    const keys: MessageCopyKey[] = ['copy.attachmentsSkipped', 'copy.imagesOmitted', 'copy.failed']
    for (const key of keys) {
      expect(zh[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
      expect(zh[key]).not.toBe(en[key])
    }
  })
})
