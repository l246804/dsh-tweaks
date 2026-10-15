/**
 * Where the panel belongs, decided from the tab on screen.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/surface
 */

import { describe, expect, it } from 'vitest'
import { decideSurface, modeOf } from '../../../src/client/features/file-panel/surface.ts'

describe('decideSurface', () => {
  it('takes the whole tab when the file-list page is on screen', () => {
    expect(decideSurface({ address: 'files', kind: 'files', workspaceRoot: '/w' })).toEqual({ kind: 'page' })
  })

  it('docks beside a file tab and names the file to mark, with its ancestor chain', () => {
    const decision = decideSurface({
      address: 'dsh-resource://file/session/s1/src/deep/a.ts',
      kind: 'text',
      workspaceRoot: '/w',
    })
    expect(decision).toEqual({
      kind: 'dock',
      activeKey: '/w/src/deep/a.ts',
      chain: ['/w', '/w/src', '/w/src/deep'],
    })
  })

  it('leaves the page when the tab is neither the file list nor a file', () => {
    expect(decideSurface({ address: 'guide', kind: 'guide', workspaceRoot: '/w' })).toEqual({ kind: 'none' })
  })

  it('leaves the page when there is no tab on screen', () => {
    expect(decideSurface({ address: undefined, kind: undefined, workspaceRoot: '/w' })).toEqual({ kind: 'none' })
  })

  it('leaves the page for a file tab in a session with no workspace root', () => {
    // Without a root there is no tree to dock against, so the file keeps the tab.
    expect(decideSurface({
      address: 'dsh-resource://file/session/s1/a.ts',
      kind: 'text',
      workspaceRoot: undefined,
    })).toEqual({ kind: 'none' })
  })
})

describe('modeOf', () => {
  it('maps each decision to the docking mode, and none to undocked', () => {
    expect(modeOf({ kind: 'page' })).toBe('page')
    expect(modeOf({ kind: 'dock', activeKey: '/w/a.ts', chain: ['/w'] })).toBe('dock')
    expect(modeOf({ kind: 'none' })).toBeUndefined()
  })
})
