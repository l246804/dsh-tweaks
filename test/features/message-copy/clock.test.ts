/**
 * Seam seven: the timestamp this row's action line renders.
 *
 * The host's copy button ships a date-aware clock, and shadowing the row means
 * reproducing it exactly, a user comparing two builds must not see the time
 * format change. The host's own `formatMessageClock` lives in `ui-chat`, a
 * module this bundle may not import (a second copy of another plugin's runtime
 * identity), so the algorithm is reproduced here.
 *
 * What these tests pin is the algorithm, not the wording. Which of the three
 * forms a timestamp takes, which date parts reach the template, and the fact
 * that the clock field itself is zero-padded are the parts a change could get
 * wrong; the sentences those templates spell are copy, which `AGENTS.md` keeps
 * out of the test gate and leaves to the eye.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/clock
 */

import type { ClockTranslate } from '../../../src/client/features/message-copy/clock.ts'
import { describe, expect, it } from 'vitest'
import { formatMessageClock, msUntilNextLocalMidnight, startOfLocalDay } from '../../../src/client/features/message-copy/clock.ts'
import { en, zh } from '../../../src/client/features/message-copy/locales.ts'

/** One call the clock made to its template seat. */
interface TemplateCall {
  readonly key: string
  readonly params: { y: number, m: number, d: number }
}

/**
 * A template seat that records instead of rendering, and contributes no text.
 *
 * Returning the empty string is deliberate: it leaves the clock field the
 * function computes on its own in the result, so a test can read that field
 * without also depending on what a dictionary happens to say.
 * @returns the seat plus the list of calls it recorded.
 */
function recordingSeat(): { readonly seat: ClockTranslate, readonly calls: TemplateCall[] } {
  const calls: TemplateCall[] = []
  const seat = ((key: string, params: { y: number, m: number, d: number }): string => {
    calls.push({ key, params })
    return ''
  }) as ClockTranslate
  return { seat, calls }
}

/** A local-midnight instant on a fixed day. */
function localTime(year: number, month: number, day: number, hour = 9, minute = 5): number {
  return new Date(year, month - 1, day, hour, minute).getTime()
}

describe('the message clock', () => {
  it('asks for no date template for a message from today', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const { seat, calls } = recordingSeat()

    const rendered = formatMessageClock(localTime(2026, 3, 14, 14, 24), seat, now)

    expect(calls).toEqual([])
    // With no template text in play, what remains is the clock field itself.
    expect(rendered).toBe('14:24')
  })

  it('asks for the month-and-day template for an earlier day this year', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const { seat, calls } = recordingSeat()

    const rendered = formatMessageClock(localTime(2026, 1, 3, 8, 7), seat, now)

    expect(calls).toEqual([{ key: 'clock.md', params: { y: 2026, m: 1, d: 3 } }])
    // The template's text is a suffix: the clock always comes after it.
    expect(rendered).toBe(' 08:07')
  })

  it('asks for the full-date template for another year', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const { seat, calls } = recordingSeat()

    const rendered = formatMessageClock(localTime(2025, 12, 31, 23, 59), seat, now)

    expect(calls).toEqual([{ key: 'clock.ymd', params: { y: 2025, m: 12, d: 31 } }])
    expect(rendered).toBe(' 23:59')
  })

  it('treats a message from the same calendar day of another year as today', () => {
    // The cut is on the calendar day, not on elapsed time: `2025-12-31 23:59`
    // read at `2026-01-01 00:30` is a different day and takes the year form.
    const now = localTime(2026, 1, 1, 0, 30)
    const { seat, calls } = recordingSeat()

    formatMessageClock(localTime(2025, 12, 31, 23, 59), seat, now)

    expect(calls.map(call => call.key)).toEqual(['clock.ymd'])
  })

  it('zero-pads both fields, so the clock keeps its width', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const { seat } = recordingSeat()

    expect(formatMessageClock(localTime(2026, 3, 14, 9, 5), seat, now)).toBe('09:05')
    expect(formatMessageClock(localTime(2026, 3, 14, 0, 0), seat, now)).toBe('00:00')
  })

  it('renders whichever language it is handed, without preferring one', () => {
    const now = localTime(2026, 3, 14, 18, 0)
    const time = localTime(2026, 1, 3, 8, 7)
    const render = (dictionary: Record<string, string>, key: string, params: Record<string, unknown>): string =>
      (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name]))
    const zhSeat = ((key: string, params: Record<string, unknown>) => render(zh, key, params)) as ClockTranslate
    const enSeat = ((key: string, params: Record<string, unknown>) => render(en, key, params)) as ClockTranslate

    const inChinese = formatMessageClock(time, zhSeat, now)
    const inEnglish = formatMessageClock(time, enSeat, now)

    expect(inChinese).toContain('08:07')
    expect(inEnglish).toContain('08:07')
    // Same time, two dictionaries, two renderings: a seat that ignored its
    // argument would collapse these into one string.
    expect(inChinese).not.toBe(inEnglish)
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

  it('supplies each date template with every placeholder the clock passes it', () => {
    // The month-and-day form has no year to show; the year form has all three.
    // Which fields each form consumes is the logic, the wording is copy.
    const expected: Record<'clock.md' | 'clock.ymd', readonly string[]> = {
      'clock.md': ['m', 'd'],
      'clock.ymd': ['y', 'm', 'd'],
    }
    for (const [key, placeholders] of Object.entries(expected) as ['clock.md' | 'clock.ymd', readonly string[]][]) {
      for (const dictionary of [zh, en]) {
        const template = dictionary[key]
        expect(template).toBeTruthy()
        for (const placeholder of placeholders)
          expect(template).toContain(`{${placeholder}}`)
        // Nothing is consumed that the clock does not pass.
        expect(template).not.toMatch(/\{(?!y\}|m\}|d\})\w+\}/u)
      }
      expect(zh[key]).not.toBe(en[key])
    }
  })
})
