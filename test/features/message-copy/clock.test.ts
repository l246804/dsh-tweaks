/**
 * Seam seven: the timestamp this row's action line renders.
 *
 * The host's copy button ships a date-aware clock, and shadowing the row means
 * reproducing it exactly, a user comparing two builds must not see the time
 * format change. The host's own `formatMessageClock` lives in `ui-chat`, a
 * module this bundle may not import (a second copy of another plugin's runtime
 * identity), so the algorithm is reproduced here and pinned against the host's
 * published behavior.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/clock
 */

import type { MessageCopyKey } from '../../../src/client/features/message-copy/locales.ts'
import { describe, expect, it } from 'vitest'
import { formatMessageClock, msUntilNextLocalMidnight, startOfLocalDay } from '../../../src/client/features/message-copy/clock.ts'
import { en, zh } from '../../../src/client/features/message-copy/locales.ts'

/** A translate seat over a plain dictionary, as the locale service provides. */
function translate(dictionary: Record<string, string>) {
  return (key: string, params?: Record<string, unknown>): string => {
    const template = dictionary[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/gu, (match, name: string) => name in params ? String(params[name]) : match)
  }
}

/** A local-midnight instant on a fixed day. */
function localTime(year: number, month: number, day: number, hour = 9, minute = 5): number {
  return new Date(year, month - 1, day, hour, minute).getTime()
}

describe('the message clock', () => {
  it('renders bare hours and minutes for a message from today', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const time = localTime(2026, 3, 14, 14, 24)

    expect(formatMessageClock(time, translate(en), now)).toBe('14:24')
  })

  it('adds the month and day template for an earlier day this year', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const time = localTime(2026, 1, 3, 8, 7)

    expect(formatMessageClock(time, translate(en), now)).toBe('1/3 08:07')
  })

  it('adds the full date template for another year', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const time = localTime(2025, 12, 31, 23, 59)

    expect(formatMessageClock(time, translate(en), now)).toBe('2025-12-31 23:59')
  })

  it('renders the Chinese templates exactly as the host does', () => {
    const now = localTime(2026, 3, 14, 18, 0)

    expect(formatMessageClock(localTime(2026, 1, 3, 8, 7), translate(zh), now)).toBe('1月3日 08:07')
    expect(formatMessageClock(localTime(2025, 12, 31, 23, 59), translate(zh), now)).toBe('2025年12月31日 23:59')
  })

  it('zero-pads both fields, so the clock keeps its width', () => {
    const now = localTime(2026, 3, 14, 18, 0)

    expect(formatMessageClock(localTime(2026, 3, 14, 9, 5), translate(en), now)).toBe('09:05')
    expect(formatMessageClock(localTime(2026, 3, 14, 0, 0), translate(en), now)).toBe('00:00')
  })

  it('treats the same calendar day as today even when the month differs from a year ago', () => {
    const now = localTime(2026, 1, 1, 0, 30)
    const time = localTime(2025, 12, 31, 23, 59)

    // Different calendar days: the year template applies.
    expect(formatMessageClock(time, translate(en), now)).toBe('2025-12-31 23:59')
  })
})

describe('the local calendar day', () => {
  it('collapses an instant to its local midnight', () => {
    const day = new Date(2026, 6, 4, 17, 30).getTime()

    expect(new Date(startOfLocalDay(day)).getHours()).toBe(0)
    expect(new Date(startOfLocalDay(day)).getDate()).toBe(4)
  })

  it('waits at least a millisecond for the next midnight, never a negative delay', () => {
    // Exactly at a local midnight the next boundary is a full day away.
    const midnight = new Date(2026, 6, 4, 0, 0, 0, 0).getTime()

    expect(msUntilNextLocalMidnight(midnight)).toBeGreaterThan(0)
    expect(msUntilNextLocalMidnight(midnight + 1)).toBeGreaterThan(0)
  })

  it('keeps the two date templates in step with the host\'s own dictionaries', () => {
    // The host's `chat` namespace defines these two; this feature cannot read
    // it, so the values are pinned here instead.
    const keys: MessageCopyKey[] = ['clock.md', 'clock.ymd']
    expect(keys.map(key => zh[key])).toEqual(['{m}月{d}日', '{y}年{m}月{d}日'])
    expect(keys.map(key => en[key])).toEqual(['{m}/{d}', '{y}-{m}-{d}'])
  })
})
