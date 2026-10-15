/**
 * What the row tells the user after a copy.
 *
 * The ticket's rule is that a degraded copy is *said*, never swallowed. The
 * text for each outcome is a pure function of the outcome and the dictionary,
 * so "every degradation has words" is a checkable claim: a `switch` that falls
 * through to silently returning nothing for an unwired case fails a test
 * instead of failing a user.
 *
 * A file never degrades a copy: it travels as its name and size in the text, so
 * only a *failure* or an image the clipboard could not hold produces a notice.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/notice
 */

import type { CopyOutcome } from './clipboard.ts'

/** The translate seat this feature's notices are rendered with. */
export interface NoticeTranslate {
  (key: 'copy.attachmentsSkipped' | 'copy.failed'): string
  (key: 'copy.imagesOmitted', params: { count: number }): string
}

/**
 * The notice one copy outcome deserves.
 * @param outcome - what the copy achieved.
 * @param t - the feature's own translate seat.
 * @returns the notice text, or undefined when there is nothing to say.
 */
export function noticeText(outcome: CopyOutcome, t: NoticeTranslate): string | undefined {
  if (outcome.status === 'failed')
    return t('copy.failed')
  if (outcome.status === 'text-only')
    return t('copy.attachmentsSkipped')
  if (outcome.omittedImages > 0)
    return t('copy.imagesOmitted', { count: outcome.omittedImages })
  return undefined
}
