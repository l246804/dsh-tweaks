/**
 * The open-file seam, as a pure decision plus a thin executor.
 *
 * These tests pin the *decision*, not the call sequence inside the sidebar: the
 * same inputs must yield the same plan whatever the layout does afterwards. The
 * executor's own test uses a recording sidebar, because the order of `focus`
 * and `close` is the one part a plan cannot express and a user can feel.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/open-file
 */

import type { OpenFilePlan, OpenFileSidebar, OpenTabLike } from '../../../src/client/features/file-panel/open-file.ts'
import { describe, expect, it } from 'vitest'
import { applyOpenFilePlan, planOpenFile } from '../../../src/client/features/file-panel/open-file.ts'

/** A page tab: the file-list tab itself, addressed by kind rather than by resource. */
const filesTab: OpenTabLike = { id: 'tab-files', kind: 'files', contentId: 'files' }

/** A document tab showing one file. */
function fileTab(id: string, path: string): OpenTabLike {
  return { id, kind: 'text', contentId: `dsh-resource://file/session/s1/${path}` }
}

const never = (): boolean => false
const always = (): boolean => true

describe('planOpenFile', () => {
  it('replaces the current tab when the address is not open yet', () => {
    const plan = planOpenFile({
      address: 'dsh-resource://file/session/s1/src/a.ts',
      current: filesTab,
      open: [filesTab],
      canClose: always,
      currentDocked: true,
    })
    expect(plan).toEqual({
      kind: 'replace',
      address: 'dsh-resource://file/session/s1/src/a.ts',
      replaceTab: 'tab-files',
    })
  })

  it('focuses an existing tab for the address and closes the current one', () => {
    const target = fileTab('tab-a', 'src/a.ts')
    const plan = planOpenFile({
      address: target.contentId,
      current: filesTab,
      open: [filesTab, target],
      canClose: always,
      currentDocked: true,
    })
    expect(plan).toEqual({ kind: 'focus', focusTabId: 'tab-a', closeTabIds: ['tab-files'] })
  })

  it('keeps the current tab when the host cannot close it', () => {
    const target = fileTab('tab-a', 'src/a.ts')
    const plan = planOpenFile({
      address: target.contentId,
      current: filesTab,
      open: [filesTab, target],
      canClose: never,
      currentDocked: true,
    })
    expect(plan).toEqual({ kind: 'focus', focusTabId: 'tab-a', closeTabIds: [] })
  })

  it('focuses the current tab when the address is what it already shows', () => {
    const current = fileTab('tab-a', 'src/a.ts')
    const plan = planOpenFile({
      address: current.contentId,
      current,
      open: [current],
      canClose: always,
      currentDocked: true,
    })
    expect(plan).toEqual({ kind: 'focus', focusTabId: 'tab-a', closeTabIds: [] })
  })

  it('opens in a new tab when the current tab floats, because a float lends no slot', () => {
    const plan = planOpenFile({
      address: 'dsh-resource://file/session/s1/src/a.ts',
      current: filesTab,
      open: [filesTab],
      canClose: always,
      currentDocked: false,
    })
    expect(plan).toEqual({ kind: 'open', address: 'dsh-resource://file/session/s1/src/a.ts' })
  })

  it('opens in a new tab when the gesture has no current tab', () => {
    const plan = planOpenFile({
      address: 'dsh-resource://file/session/s1/src/a.ts',
      current: undefined,
      open: [],
      canClose: always,
      currentDocked: false,
    })
    expect(plan).toEqual({ kind: 'open', address: 'dsh-resource://file/session/s1/src/a.ts' })
  })

  it('focuses an existing tab without a current tab to close', () => {
    const target = fileTab('tab-a', 'src/a.ts')
    const plan = planOpenFile({
      address: target.contentId,
      current: undefined,
      open: [target],
      canClose: always,
      currentDocked: false,
    })
    expect(plan).toEqual({ kind: 'focus', focusTabId: 'tab-a', closeTabIds: [] })
  })

  it('matches the address exactly rather than by suffix', () => {
    const decoy = fileTab('tab-decoy', 'other/src/a.ts')
    const plan = planOpenFile({
      address: 'dsh-resource://file/session/s1/src/a.ts',
      current: filesTab,
      open: [filesTab, decoy],
      canClose: always,
      currentDocked: true,
    })
    expect(plan.kind).toBe('replace')
  })
})

describe('applyOpenFilePlan', () => {
  /** A sidebar that records every call in order. */
  function recording(): { calls: string[], sidebar: OpenFileSidebar } {
    const calls: string[] = []
    return {
      calls,
      sidebar: {
        openResource: (address, options) => { calls.push(`open ${address} replace=${String(options?.replaceTab)}`) },
        focus: (tabId) => { calls.push(`focus ${tabId}`) },
        close: (tabId) => { calls.push(`close ${tabId}`) },
      },
    }
  }

  it('focuses before closing, so the pane is never left empty', () => {
    const { calls, sidebar } = recording()
    const plan: OpenFilePlan = { kind: 'focus', focusTabId: 'tab-a', closeTabIds: ['tab-files'] }
    applyOpenFilePlan(sidebar, plan)
    expect(calls).toEqual(['focus tab-a', 'close tab-files'])
  })

  it('opens a replacement in the named tab', () => {
    const { calls, sidebar } = recording()
    applyOpenFilePlan(sidebar, { kind: 'replace', address: 'dsh-resource://file/session/s1/a.ts', replaceTab: 'tab-files' })
    expect(calls).toEqual(['open dsh-resource://file/session/s1/a.ts replace=tab-files'])
  })

  it('opens plainly when the plan says so', () => {
    const { calls, sidebar } = recording()
    applyOpenFilePlan(sidebar, { kind: 'open', address: 'dsh-resource://file/session/s1/a.ts' })
    expect(calls).toEqual(['open dsh-resource://file/session/s1/a.ts replace=undefined'])
  })

  it('closes every tab a plan names, in order', () => {
    const { calls, sidebar } = recording()
    applyOpenFilePlan(sidebar, { kind: 'focus', focusTabId: 'tab-a', closeTabIds: ['tab-b', 'tab-c'] })
    expect(calls).toEqual(['focus tab-a', 'close tab-b', 'close tab-c'])
  })
})
