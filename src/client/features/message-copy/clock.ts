/**
 * The timestamp this feature's user-message row renders.
 *
 * The host's own clock (`ui-chat`'s `formatMessageClock`) is the behavior being
 * reproduced: same-day messages show `HH:mm`, earlier days this year add the
 * host's `clock.md` template, and other years add `clock.ymd`. It lives in
 * another plugin's module, which this bundle may not import, doing so would
 * ship a second copy of that plugin's runtime identity, so the algorithm is
 * restated here and pinned against the host's behavior by test.
 *
 * The input is a message's own event time, and the reference instant is a
 * parameter rather than `Date.now()` so the day and year boundaries are
 * testable.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/clock
 */

import type { MessageCopyKey } from './locales.ts'

/** The date templates the clock consumes, from this feature's dictionary. */
export type ClockTranslate = (
  key: Extract<MessageCopyKey, 'clock.md' | 'clock.ymd'>,
  params: { y: number, m: number, d: number },
) => string

/**
 * Zero-pad one clock field to two digits.
 * @param value - the field's numeric value.
 * @returns the padded text.
 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Local midnight of the day an instant falls on.
 * @param ms - a Unix epoch timestamp.
 * @returns the timestamp of that day's local midnight.
 */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * How long until the next local midnight after an instant.
 *
 * Never zero: the timer that uses this would otherwise re-arm in a loop. A
 * clock change that lands exactly on midnight still gets a millisecond, which
 * is enough for the day state to publish.
 * @param ms - a Unix epoch timestamp.
 * @returns a positive delay in milliseconds.
 */
export function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * Render one message's timestamp the way the host's message actions do.
 * @param time - Unix epoch ms from the source session event.
 * @param t - the date-template seat, from this feature's dictionary.
 * @param now - the reference instant for the day/year cut.
 * @returns the date-aware clock string (24-hour, zero-padded).
 */
export function formatMessageClock(time: number, t: ClockTranslate, now: number = Date.now()): string {
  const date = new Date(time)
  const reference = new Date(now)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (
    date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()
  ) {
    return clock
  }
  const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
  const day = date.getFullYear() === reference.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)
  return `${day} ${clock}`
}
