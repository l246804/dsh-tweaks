/**
 * The activation seam: which file a tab shows, and when the panel may scroll.
 *
 * The scroll-timing cases are the reason this seam exists. A parent chain loads
 * one level at a time, so the rows above the target arrive late and the list
 * grows under a scroll that already ran; the decision must therefore be able to
 * say "wait" without knowing anything about the panel's own state.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/activation
 */

import { describe, expect, it } from 'vitest'
import { activationTarget, decideScroll, parseFileAddressPath } from '../../../src/client/features/file-panel/activation.ts'

describe('parseFileAddressPath', () => {
  it('decodes a session file address', () => {
    expect(parseFileAddressPath('dsh-resource://file/session/s1/src/a%20b.ts'))
      .toEqual({ sessionId: 's1', path: 'src/a b.ts' })
  })

  it('rejects a page address that is not a resource', () => {
    expect(parseFileAddressPath('files')).toBeUndefined()
  })

  it('rejects an absolute-scope address, which has no session to activate in', () => {
    expect(parseFileAddressPath('dsh-resource://file/absolute/%2Ftmp%2Fa.ts')).toBeUndefined()
  })
})

describe('activationTarget', () => {
  it('derives the file and every ancestor directory from the workspace root down', () => {
    const target = activationTarget('dsh-resource://file/session/s1/src/deep/a.ts', '/w')
    expect(target).toEqual({
      sessionId: 's1',
      relativePath: 'src/deep/a.ts',
      absolutePath: '/w/src/deep/a.ts',
      chain: ['/w', '/w/src', '/w/src/deep'],
      key: '/w/src/deep/a.ts',
    })
  })

  it('gives a top-level file a chain of just the root', () => {
    expect(activationTarget('dsh-resource://file/session/s1/README.md', '/w')?.chain).toEqual(['/w'])
  })

  it('tolerates a trailing separator on the root', () => {
    expect(activationTarget('dsh-resource://file/session/s1/a.ts', '/w/')?.absolutePath).toBe('/w/a.ts')
  })

  it('has no target without a workspace root', () => {
    expect(activationTarget('dsh-resource://file/session/s1/a.ts', undefined)).toBeUndefined()
    expect(activationTarget('dsh-resource://file/session/s1/a.ts', '')).toBeUndefined()
  })

  it('has no target for a page address', () => {
    expect(activationTarget('files', '/w')).toBeUndefined()
  })

  it('ignores empty path segments rather than producing a doubled separator', () => {
    const target = activationTarget('dsh-resource://file/session/s1//src//a.ts', '/w')
    expect(target?.chain).toEqual(['/w', '/w/src'])
  })
})

describe('decideScroll', () => {
  it('does nothing while no file tab is active', () => {
    expect(decideScroll({ scrolledKey: '/w/a.ts', activeKey: undefined, pending: 0 })).toBe('idle')
  })

  it('scrolls the first time an activation appears', () => {
    expect(decideScroll({ scrolledKey: undefined, activeKey: '/w/a.ts', pending: 0 })).toBe('scroll')
  })

  it('waits while any directory listing of the active chain is still in flight', () => {
    expect(decideScroll({ scrolledKey: undefined, activeKey: '/w/a.ts', pending: 2 })).toBe('wait')
  })

  it('scrolls once the pending listings have landed', () => {
    expect(decideScroll({ scrolledKey: undefined, activeKey: '/w/a.ts', pending: 0 })).toBe('scroll')
  })

  it('does not scroll again for the same activation, so a refresh or a manual scroll keeps the reader where they are', () => {
    expect(decideScroll({ scrolledKey: '/w/a.ts', activeKey: '/w/a.ts', pending: 0 })).toBe('idle')
    expect(decideScroll({ scrolledKey: '/w/a.ts', activeKey: '/w/a.ts', pending: 3 })).toBe('idle')
  })

  it('scrolls when the activation changes to another file', () => {
    expect(decideScroll({ scrolledKey: '/w/a.ts', activeKey: '/w/b.ts', pending: 0 })).toBe('scroll')
  })

  it('waits when the activation changed but its chain is still loading', () => {
    expect(decideScroll({ scrolledKey: '/w/a.ts', activeKey: '/w/b.ts', pending: 1 })).toBe('wait')
  })
})
