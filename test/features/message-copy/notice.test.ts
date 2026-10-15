/**
 * Seam eight: what the row tells the user after a copy.
 *
 * The ticket's rule is that a degraded copy must be *said*, not swallowed. The
 * text for each outcome is a pure function of the outcome and the dictionary,
 * which is what makes "every degradation has words" a checkable claim rather
 * than a promise, the alternative is a switch that quietly returns nothing for
 * a case nobody wired up.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/notice
 */

import type { MessageCopyKey } from '../../../src/client/features/message-copy/locales.ts'
import { describe, expect, it } from 'vitest'
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

  it('explains an unsupported host in the user\'s language', () => {
    expect(noticeText({ status: 'text-only', reason: 'unsupported' }, ZH))
      .toBe('仅复制了文字：浏览器不允许把附件写入剪贴板')
    expect(noticeText({ status: 'text-only', reason: 'unsupported' }, EN))
      .toBe('Copied text only: the browser would not put attachments on the clipboard')
  })

  it('explains a refused write, distinguishing it from an unsupported host', () => {
    expect(noticeText({ status: 'text-only', reason: 'denied' }, ZH))
      .toBe('仅复制了文字：浏览器不允许把附件写入剪贴板')
    expect(noticeText({ status: 'text-only', reason: 'denied' }, EN))
      .toBe('Copied text only: the browser would not put attachments on the clipboard')
  })

  it('explains a total failure instead of staying silent', () => {
    expect(noticeText({ status: 'failed' }, ZH)).toBe('复制失败：浏览器拒绝了剪贴板写入')
    expect(noticeText({ status: 'failed' }, EN)).toBe('Copy failed: the browser refused the clipboard write')
  })

  it('counts the images the clipboard could not hold, while reporting the copy as landed', () => {
    const notice = noticeText({ status: 'copied', attachmentsIncluded: true, omittedImages: 2 }, EN)

    expect(notice).toBe('2 same-format image(s) did not fit on the clipboard')
  })

  it('mentions an omitted image even when only one was left out', () => {
    const notice = noticeText({ status: 'copied', attachmentsIncluded: true, omittedImages: 1 }, ZH)

    expect(notice).toBe('有 1 张同格式图片无法放入剪贴板')
  })

  it('answers with copy for every non-landed outcome, so no case is wordless', () => {
    const outcomes = [
      { status: 'text-only', reason: 'unsupported' },
      { status: 'text-only', reason: 'denied' },
      { status: 'failed' },
      { status: 'copied', attachmentsIncluded: true, omittedImages: 3 },
    ] as const

    for (const outcome of outcomes) {
      expect(typeof noticeText(outcome, EN)).toBe('string')
      expect(noticeText(outcome, EN)?.length).toBeGreaterThan(0)
    }
  })

  it('keeps the two dictionaries in step, key for key', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('dshTweaksMessageCopy')
    // Every key the notice can ask for exists in both.
    const keys: MessageCopyKey[] = ['copy.attachmentsSkipped', 'copy.imagesOmitted', 'copy.failed']
    for (const key of keys) {
      expect(zh[key]).toBeTruthy()
      expect(en[key]).toBeTruthy()
    }
  })
})
