/**
 * The open-file seam, as a pure decision plus a thin executor, and then as the
 * two real call points that use them.
 *
 * The first two suites pin the *decision* and its call order, which is what the
 * layout cannot express: the same inputs must yield the same plan whatever the
 * sidebar does afterwards.
 *
 * The third suite is the one the issue asks for by name. A decision is not what
 * a reader clicks: `openRow` in `index.ts` is, and it is the only place that
 * turns a tree row into those four inputs, including the one fact that is read
 * out of the page (`isDocked` walks from the kit's `data-dockkit-content`
 * section up to its `data-dockkit-host` cell). So those tests install the whole
 * feature over a drawn sidebar and click the row the panel's own renderer was
 * handed, which is the real gesture end to end. `open-row-scene.ts` explains
 * what is real and what is substituted there.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/open-file
 */

import type { OpenFilePlan, OpenFileSidebar, OpenTabLike } from '../../../src/client/features/file-panel/open-file.ts'
import type { OpenRowScene, RenderProps, Scene } from './open-row-scene.ts'
import { describe, expect, it, vi } from 'vitest'
import { applyOpenFilePlan, planOpenFile } from '../../../src/client/features/file-panel/open-file.ts'
import { openRowScene } from './open-row-scene.ts'

/**
 * The element the panel's React root was last asked to render.
 *
 * `react-dom/client` cannot load in plain Node (it asks for a browser), and the
 * panel's root is the one thing here that genuinely needs it. Recording the
 * element instead is not a shortcut around the call point: the element's props
 * are built by `renderer.ts` from the panel's own options, and its `onOpen` is
 * the exact function a row's `onClick` runs. Reading it is reading the gesture.
 */
const root = vi.hoisted(() => ({ element: undefined as unknown }))

vi.mock('react-dom/client', () => ({
  createRoot: () => ({
    render: (element: unknown) => {
      root.element = element
    },
    unmount: () => {},
  }),
}))

// The view's icons classify files through the host's own package, whose runtime
// dependencies are not installed in this Node test environment. This suite
// never renders the view, so only its import has to resolve.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  FileTypeIcon: () => null,
  IconFolderCloseRegular: () => null,
  IconFolderOpenRegular: () => null,
  IconWorkspaceTreeOutlineRegular: () => null,
  classifyFileType: () => 'file',
}))

/** The props of the element the root was last handed; undefined before the first render. */
function latestProps(): RenderProps | undefined {
  const element = root.element as { props?: RenderProps } | undefined
  return element?.props
}

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

/**
 * The two real call points, driven through the installed feature.
 *
 * The issue names them explicitly, and they are genuinely two situations rather
 * than two spellings of one: the tab a row is clicked from is either the file
 * list (which should be *replaced*) or a file tab (which should switch in
 * place). The decision already covers both; what is unverified until here is
 * that `openRow` reads the page correctly enough to select the right one, most
 * of all that it can tell a docked tab from a floating one. It learns that only
 * by walking up from the kit's section to its cell.
 */
describe('opening a file from a row, through the installed feature', () => {
  /** A file list plus two files already open in their own tabs. */
  const base: Scene = {
    sessionId: 's1',
    workspaceRoot: '/w',
    tabs: [
      { id: 'tab-files', kind: 'files', contentId: 'files' },
      { id: 'tab-a', kind: 'text', contentId: 'src/a.ts' },
    ],
    activeTabId: 'tab-files',
  }

  /** The address `openRow` will build for one workspace path. */
  const address = (path: string): string => `dsh-resource://file/session/s1/${path}`

  it('call point A: takes the file list tab\'s slot, so no second tab appears', async () => {
    const scene = openRowScene(base, latestProps)
    await scene.settle()
    const before = scene.tabs().length

    scene.open('/w/src/b.ts')

    // The placement is the whole behaviour: the open names the file list as the
    // tab to take the slot of, which is the one call the sidebar has for
    // "replace in place, closing the replaced tab in the same step".
    expect(scene.calls.opened).toEqual([{
      via: 'openResourceIn',
      sessionId: 's1',
      address: address('src/b.ts'),
      replaceTab: 'tab-files',
    }])
    // The tab it replaced acted on the session it belongs to, not on whichever
    // session happens to be on screen by the time the call runs.
    expect(scene.calls.focused).toEqual([])
    expect(scene.calls.closed).toEqual([])
    // One out, one in: the file list's slot is reused rather than added to, and
    // it is reused *in place*, so the file that opened sits where the list was.
    await scene.settle()
    expect(scene.tabs().map(tab => tab.id)).toEqual(['tab-n1', 'tab-a'])
    expect(scene.tabs().length).toBe(before)
    scene.unload()
  })

  it('call point B: switches the file tab it is docked in, leaving the panel where it is', async () => {
    const scene = openRowScene({ ...base, activeTabId: 'tab-a' }, latestProps)
    // Let the panel dock into the file tab, which is what makes `isDocked` true.
    await scene.settle()
    const actingTab = scene.activeTab()
    expect(actingTab.kind).toBe('text')
    expect(scene.homeTabId()).toBe('tab-a')
    expect(scene.homeMode()).toBe('dock')
    const container = scene.containers()
    expect(container).toHaveLength(1)

    scene.open('/w/src/b.ts')

    expect(scene.calls.opened).toEqual([{
      via: 'openResourceIn',
      sessionId: 's1',
      address: address('src/b.ts'),
      replaceTab: 'tab-a',
    }])
    await scene.settle()
    // The acting tab is replaced by the file it just opened, and the file list
    // is untouched: the reader never leaves the tab they were reading in.
    expect(scene.tabs().map(tab => tab.id)).toEqual(['tab-files', 'tab-n1'])
    expect(scene.calls.closed).toEqual([])
    // And the panel is the same one, following the tab it was already in. A
    // rebuild here would be invisible in the tree but would drop the expansion,
    // the loaded levels and every directory subscription, which is exactly what
    // the single-instance rule exists to prevent.
    expect(scene.containers()).toHaveLength(1)
    expect(scene.containers()[0]).toBe(container[0])
    expect(scene.homeTabId()).toBe('tab-n1')
    expect(scene.homeMode()).toBe('dock')
    scene.unload()
  })

  it('focuses a tab that already shows the file, before closing the file list', async () => {
    const scene = openRowScene(base, latestProps)
    await scene.settle()

    scene.open('/w/src/a.ts')

    // Nothing is opened: `a.ts` is already on screen, so the work is to bring
    // that tab forward and retire the file list.
    expect(scene.calls.opened).toEqual([])
    expect(scene.calls.focused).toEqual(['tab-a'])
    expect(scene.calls.closed).toEqual(['tab-files'])
    // Focus precedes the close, or the pane is empty for a frame. The focus
    // itself is what the check reads, so the order in the log is the evidence.
    expect(scene.calls.order).toEqual(['focus tab-a', 'close s1 tab-files'])
    // At the moment of the close the focused tab was already the active one.
    expect(scene.calls.activeAtClose).toEqual(['tab-a'])
    await scene.settle()
    expect(scene.tabs().map(tab => tab.id)).toEqual(['tab-a'])
    scene.unload()
  })

  it('opens plainly from a floating tab, because a float lends no slot', async () => {
    const scene = openRowScene({
      ...base,
      tabs: [{ id: 'tab-files', kind: 'files', contentId: 'files', floating: true }, base.tabs[1]!],
    }, latestProps)
    await scene.settle()

    // Fixture check, so this test cannot pass for the wrong reason: the tab the
    // row is clicked from must really be drawn as floating by the kit's own
    // anchor, or `isDocked` would be reporting on something else entirely.
    const section = scene.document.querySelector('[data-dockkit-content="tab-files"]')
    expect(section?.closest('[data-dockkit-host]')?.getAttribute('data-dockkit-host')).toBe('float')

    scene.open('/w/src/b.ts')

    // The regression this guards: a float holds one tab and has no slot to give,
    // so `replaceTab` would be a lie the sidebar quietly ignores. Degrading to a
    // plain open is the upstream behaviour, and the only correct answer here.
    expect(scene.calls.opened).toEqual([{
      via: 'openResourceIn',
      sessionId: 's1',
      address: address('src/b.ts'),
      replaceTab: undefined,
    }])
    await scene.settle()
    expect(scene.tabs().map(tab => tab.id)).toEqual(['tab-files', 'tab-a', 'tab-n1'])
    scene.unload()
  })

  it('treats a tab the shell has not rendered yet as unable to lend a slot', async () => {
    const scene = openRowScene({
      ...base,
      tabs: [{ ...base.tabs[0]!, rendered: false }, base.tabs[1]!],
    }, latestProps)
    await scene.settle()

    // Fixture check: the shell really has not drawn this tab, which is the only
    // reason the answer below is "no slot".
    expect(scene.document.querySelector('[data-dockkit-content="tab-files"]')).toBeNull()

    scene.open('/w/src/b.ts')

    // No host element means no cell to walk up to, and the conservative answer
    // is a plain open rather than a placement pointing at a tab with no pane.
    expect(scene.calls.opened[0]?.replaceTab).toBeUndefined()
    scene.unload()
  })

  it('distinguishes a docked tab from a floating one by the kit\'s own host anchor', async () => {
    // The scenes differ in one attribute and must produce opposite placements,
    // which pins the fact `openRow` reads out of the page. One at a time: the
    // install reaches the page through the global `document`.
    const hostOf = (scene: OpenRowScene): string | undefined =>
      scene.document.querySelector('[data-dockkit-content="tab-files"]')
        ?.closest('[data-dockkit-host]')
        ?.getAttribute('data-dockkit-host') ?? undefined

    const docked = openRowScene(base, latestProps)
    await docked.settle()
    expect(hostOf(docked)).toBe('dock')
    docked.open('/w/src/b.ts')
    expect(docked.calls.opened[0]?.replaceTab).toBe('tab-files')
    docked.unload()

    const floating = openRowScene({
      ...base,
      tabs: [{ id: 'tab-files', kind: 'files', contentId: 'files', floating: true }, base.tabs[1]!],
    }, latestProps)
    await floating.settle()
    expect(hostOf(floating)).toBe('float')
    floating.open('/w/src/b.ts')
    expect(floating.calls.opened[0]?.replaceTab).toBeUndefined()
    floating.unload()
  })

  it('can open file after file without going back to the file list', async () => {
    // The acceptance criterion is about a sequence, not one click: after the
    // first replacement the acting tab is the file that just opened, and the
    // next click must switch that same tab again rather than start a new one.
    const scene = openRowScene(base, latestProps)
    await scene.settle()

    scene.open('/w/src/b.ts')
    await scene.settle()
    const [replacement] = scene.tabs().filter(tab => tab.id !== 'tab-a')
    expect(replacement).toBeDefined()

    // The shell switches to the tab the open settled on, as the store does.
    await scene.activate(replacement!.id)
    expect(scene.homeTabId()).toBe(replacement!.id)

    scene.open('/w/src/c.ts')
    await scene.settle()

    expect(scene.calls.opened.map(entry => entry.replaceTab)).toEqual(['tab-files', replacement!.id])
    // Two files opened from two clicks in one slot: the list's slot is still
    // the only one they ever used, and the `a.ts` tab was never disturbed.
    expect(scene.tabs().map(tab => tab.id)).toEqual(['tab-n2', 'tab-a'])
    scene.unload()
  })
})
