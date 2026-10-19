/**
 * Keeping the panel docked in whatever tab is on screen.
 *
 * Two things are under test. The **decision** is a pure function of two
 * snapshots, so the cases that matter (no session, no active tab, a tab the
 * inventory has not published yet) are plain data in, plain data out. The
 * **loop** is about timing, and specifically about looking *after* the shell has
 * rendered the body it switched to; a resolve that ran synchronously with the
 * click would find the old element, which is the failure this design exists to
 * avoid.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/docking
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DockingOptions, OpenTab, SidebarFacts } from '../../../src/client/features/file-panel/docking.ts'
import { describe, expect, it, vi } from 'vitest'
import {
  DOCKKIT_ANCHORS,
  SIDEBAR_RIGHT_ANCHORS,
  TEXT_PREVIEW_ANCHORS,
} from '../../../src/client/dom/host-anchors.ts'
import { createDocking, resolveDockTarget } from '../../../src/client/features/file-panel/docking.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { sessionId, tabId } from './ids.ts'

const filesTab: OpenTab = { sessionId: sessionId('s1'), tabId: tabId('tab-files'), kind: 'files', contentId: 'files' }
const textTab: OpenTab = { sessionId: sessionId('s1'), tabId: tabId('tab-a'), kind: 'text', contentId: 'dsh-resource://file/session/s1/src/a.ts' }

/** Sidebar facts over fixed values. */
function facts(overrides: Partial<SidebarFacts> = {}): SidebarFacts {
  return {
    onScreenSession: () => sessionId('s1'),
    activeTab: () => ({ id: tabId('tab-files'), kind: 'files', contentId: 'files' }),
    workspaceRootOf: () => '/w',
    ...overrides,
  }
}

describe('resolveDockTarget', () => {
  it('names the session, the tab, its kind, its address and the workspace root', () => {
    expect(resolveDockTarget(facts(), [filesTab, textTab])).toEqual({
      sessionId: 's1',
      tabId: 'tab-files',
      kind: 'files',
      address: 'files',
      workspaceRoot: '/w',
    })
  })

  it('takes the kind from the inventory, which is the only place it is published', () => {
    const target = resolveDockTarget(facts({
      activeTab: () => ({ id: tabId('tab-a'), kind: 'text', contentId: textTab.contentId }),
    }), [filesTab, textTab])
    expect(target?.kind).toBe('text')
  })

  it('falls back to the active record\'s own kind for a tab the inventory has not caught up with', () => {
    const target = resolveDockTarget(facts(), [])
    expect(target?.kind).toBe('files')
    expect(target?.address).toBe('files')
  })

  it('has nothing to dock without a session on screen', () => {
    expect(resolveDockTarget(facts({ onScreenSession: () => undefined }), [filesTab])).toBeUndefined()
  })

  it('has nothing to dock without an active tab', () => {
    expect(resolveDockTarget(facts({ activeTab: () => undefined }), [filesTab])).toBeUndefined()
  })

  it('reports no workspace root for a session whose header carries no cwd', () => {
    expect(resolveDockTarget(facts({ workspaceRootOf: () => undefined }), [filesTab])?.workspaceRoot).toBeUndefined()
  })

  it('ignores an inventory row belonging to another session', () => {
    const other: OpenTab = { sessionId: sessionId('s2'), tabId: tabId('tab-files'), kind: 'terminal', contentId: 'terminal' }
    expect(resolveDockTarget(facts(), [other, filesTab])?.kind).toBe('files')
  })
})

/** A document holding one tab's body, plus the sources and a manual deferrer. */
function harness(initialTabs: readonly OpenTab[] = [filesTab, textTab]) {
  const dom = createFakeDom()
  let inventory: readonly OpenTab[] = initialTabs
  let session: SessionId | undefined = sessionId('s1')
  let active: { id: TabId, kind: string, contentId: string } | undefined = { id: tabId('tab-files'), kind: 'files', contentId: 'files' }
  const inventoryListeners = new Set<() => void>()
  const sessionListeners = new Set<() => void>()
  const deferred: (() => void)[] = []
  const placed: { target: string | undefined, hasElement: boolean }[] = []
  const placedElements: (unknown)[] = []

  const options: DockingOptions = {
    document: dom.document as never,
    facts: {
      onScreenSession: () => session,
      activeTab: () => active,
      workspaceRootOf: () => '/w',
    },
    inventory: {
      getSnapshot: () => inventory,
      subscribe: (listener) => {
        inventoryListeners.add(listener)
        return () => {
          inventoryListeners.delete(listener)
        }
      },
    },
    onScreen: {
      getSnapshot: () => session,
      subscribe: (listener) => {
        sessionListeners.add(listener)
        return () => {
          sessionListeners.delete(listener)
        }
      },
    },
    defer: (work) => { deferred.push(work) },
    place: (target, element) => {
      placed.push({ target: target?.tabId, hasElement: element !== undefined })
      placedElements.push(element)
    },
  }

  /** Run every deferred resolve, in order. */
  const flush = (): void => {
    while (deferred.length > 0) deferred.shift()!()
  }

  /** Add one tab's body elements to the document, the way the shell renders them. */
  const renderBody = (tabId: string): void => {
    const section = dom.document.createElement('section')
    section.setAttribute(DOCKKIT_ANCHORS.content.name, tabId)
    const wrapper = dom.document.createElement('div')
    wrapper.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
    section.appendChild(wrapper)
    dom.document.body.appendChild(section)
  }

  /** The title and body seats of each tab rendered the realistic way. */
  const seats = new Map<string, { title: unknown, body: unknown }>()

  /**
   * Add one tab exactly as the shell renders it: a title seat inside the strip's
   * chip, then the body seat, both carrying the tab id in that document order.
   * @param tabId - the tab record's id.
   */
  const renderRealTab = (tabId: string): void => {
    const section = dom.document.createElement('section')
    section.setAttribute(DOCKKIT_ANCHORS.content.name, tabId)
    const header = dom.document.createElement('div')
    const stripTabs = dom.document.createElement('div')
    stripTabs.setAttribute(DOCKKIT_ANCHORS.stripTabs.name, 'pane-1')
    const chip = dom.document.createElement('div')
    chip.setAttribute(DOCKKIT_ANCHORS.tab.name, tabId)
    const titleBox = dom.document.createElement('span')
    titleBox.setAttribute(DOCKKIT_ANCHORS.tabTitle.name, '')
    const title = dom.document.createElement('span')
    title.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
    titleBox.appendChild(title)
    chip.appendChild(titleBox)
    stripTabs.appendChild(chip)
    header.appendChild(stripTabs)
    const body = dom.document.createElement('div')
    body.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
    section.appendChild(header)
    section.appendChild(body)
    dom.document.body.appendChild(section)
    seats.set(tabId, { title, body })
  }

  /**
   * Add the preview root inside one already-rendered tab's body, the way the
   * preview plugin mounts into the sidebar's seat.
   * @param tabId - the tab record's id.
   * @returns the preview root.
   */
  const renderPreviewRoot = (tabId: string): unknown => {
    const body = seats.get(tabId)?.body as { appendChild: (child: unknown) => void }
    const preview = dom.document.createElement('div')
    preview.setAttribute(TEXT_PREVIEW_ANCHORS.state.name, 'text')
    const toolbar = dom.document.createElement('div')
    const path = dom.document.createElement('span')
    path.setAttribute(TEXT_PREVIEW_ANCHORS.path.name, '')
    toolbar.appendChild(path)
    const content = dom.document.createElement('div')
    content.setAttribute(TEXT_PREVIEW_ANCHORS.body.name, '')
    preview.appendChild(toolbar)
    preview.appendChild(content)
    body.appendChild(preview)
    return preview
  }

  /**
   * Add one file tab whose body already holds a preview root.
   * @param tabId - the tab record's id.
   * @returns the preview root, which is what a docked panel should land in.
   */
  const renderPreviewTab = (tabId: string): unknown => {
    renderRealTab(tabId)
    return renderPreviewRoot(tabId)
  }

  const bodyOf = (tabId: string): unknown => seats.get(tabId)?.body
  const titleOf = (tabId: string): unknown => seats.get(tabId)?.title

  return {
    dom: { ...dom, bodyOf, titleOf },
    options,
    placed,
    placedElements,
    flush,
    renderBody,
    renderRealTab,
    renderPreviewTab,
    renderPreviewRoot,
    deferredCount: () => deferred.length,
    /** Publish a new inventory and notify, as the sidebar's store does. */
    setInventory(next: readonly OpenTab[]) {
      inventory = next
      for (const listener of [...inventoryListeners]) listener()
    },
    /** The reader selects another tab: the active record changes now. */
    setActiveTab(next: { id: TabId, kind: string, contentId: string } | undefined) {
      active = next
    },
    /** Switch the on-screen session and notify. */
    setSession(next: SessionId | undefined) {
      session = next
      active = next === undefined ? undefined : active
      for (const listener of [...sessionListeners]) listener()
    },
    listenerCount: () => inventoryListeners.size + sessionListeners.size,
  }
}

describe('the docking loop', () => {
  it('resolves once at start, and only after the current task', () => {
    const h = harness()
    const docking = createDocking(h.options)
    // Nothing has been placed yet: the resolve is deferred so the shell's render
    // can commit first.
    expect(h.placed).toEqual([])
    expect(h.deferredCount()).toBe(1)
    h.flush()
    expect(h.placed).toEqual([{ target: 'tab-files', hasElement: false }])
    docking.dispose()
  })

  it('places with the element once the shell has rendered the tab body', () => {
    const h = harness()
    h.renderBody('tab-files')
    const docking = createDocking(h.options)
    h.flush()
    expect(h.placed).toEqual([{ target: 'tab-files', hasElement: true }])
    docking.dispose()
  })

  it('hands the placer the tab body, not the chip title that carries the same id', () => {
    // The one place the shell's real structure is exercised end to end. The
    // sidebar tags the title seat and the body seat with the tab id, and the
    // title comes first inside the section, so a placer handed "the first seat"
    // would append the panel into the chip's label.
    const h = harness()
    h.renderRealTab('tab-files')
    const docking = createDocking(h.options)
    h.flush()

    const element = h.placedElements.at(-1) as { getAttribute: (name: string) => string | null } | undefined
    expect(element?.getAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name)).toBe('tab-files')
    // The identity that matters is *which* seat, not which tag it happens to be:
    // the body is the element the host calls the body, and never the title.
    expect(h.dom.bodyOf('tab-files')).toBe(element)
    expect(h.dom.titleOf('tab-files')).not.toBe(element)
    docking.dispose()
  })

  it('hands the placer the preview root for a file tab, not the wrapper that also holds the toolbar', () => {
    // A docked panel belongs under the preview's toolbar row, not beside it, so
    // the element handed over is the preview's own root. The sidebar's body seat
    // would put the panel next to the toolbar, which is the placement #6 reports.
    const h = harness()
    const preview = h.renderPreviewTab('tab-a')
    h.setActiveTab({ id: tabId('tab-a'), kind: 'text', contentId: textTab.contentId })
    const docking = createDocking(h.options)
    h.flush()

    const element = h.placedElements.at(-1)
    expect(element).toBe(preview)
    expect(h.dom.bodyOf('tab-a')).not.toBe(element)
    docking.dispose()
  })

  it('hands the placer the sidebar seat for the file-list page, where no preview root exists', () => {
    const h = harness()
    h.renderRealTab('tab-files')
    const docking = createDocking(h.options)
    h.flush()

    expect(h.placedElements.at(-1)).toBe(h.dom.bodyOf('tab-files'))
    docking.dispose()
  })

  it('re-resolves when the same tab renders a different host element, so the panel moves into it', () => {
    // A file tab's body is the sidebar's seat at first, and the preview root
    // appears *inside* it once the preview mounts. The target never changed, but
    // the element did, and the panel has to move to the new one rather than stay
    // beside the toolbar row.
    const h = harness()
    h.renderRealTab('tab-a')
    h.setActiveTab({ id: tabId('tab-a'), kind: 'text', contentId: textTab.contentId })
    const docking = createDocking(h.options)
    h.flush()
    const seat = h.dom.bodyOf('tab-a')
    expect(h.placedElements.at(-1)).toBe(seat)
    expect(h.placed).toHaveLength(1)

    // The preview mounts, and the next signal re-resolves.
    const preview = h.renderPreviewRoot('tab-a')
    h.dom.document.dispatchEvent({ type: 'click' })
    h.flush()
    expect(h.placedElements.at(-1)).toBe(preview)
    expect(h.placed).toHaveLength(2)
    docking.dispose()
  })

  it('re-resolves after a gesture, not during it, so the new body element is found', () => {
    const h = harness()
    h.renderBody('tab-files')
    const docking = createDocking(h.options)
    h.flush()
    h.placed.length = 0

    // The reader clicks a file tab: the layout changes now, the body element
    // appears on the next render.
    h.setActiveTab({ id: tabId('tab-a'), kind: 'text', contentId: textTab.contentId })
    h.dom.document.dispatchEvent({ type: 'click' })
    // Nothing is placed yet: the resolve waits for the shell's render.
    expect(h.placed).toEqual([])
    h.renderBody('tab-a')
    h.flush()
    expect(h.placed).toEqual([{ target: 'tab-a', hasElement: true }])
    docking.dispose()
  })

  it('coalesces several signals into one resolve', () => {
    const h = harness()
    h.renderBody('tab-files')
    const docking = createDocking(h.options)
    h.flush()
    const before = h.deferredCount()
    h.dom.document.dispatchEvent({ type: 'click' })
    h.dom.document.dispatchEvent({ type: 'focusin' })
    h.setInventory([filesTab])
    // All three arrived in the same task, so they share one deferred resolve.
    expect(h.deferredCount() - before).toBe(1)
    docking.dispose()
  })

  it('does not report the same target twice, so a reveal is not re-run', () => {
    const h = harness()
    h.renderBody('tab-files')
    const docking = createDocking(h.options)
    h.flush()
    expect(h.placed).toHaveLength(1)
    h.setInventory([...h.options.inventory.getSnapshot()])
    h.flush()
    expect(h.placed).toHaveLength(1)
    docking.dispose()
  })

  it('reports a change of session, which is a different workspace', () => {
    const h = harness()
    h.renderBody('tab-files')
    const docking = createDocking(h.options)
    h.flush()
    h.setSession(undefined)
    h.flush()
    expect(h.placed.at(-1)?.target).toBeUndefined()
    docking.dispose()
  })

  it('stops listening and cancels a deferred resolve on dispose', () => {
    const h = harness()
    const docking = createDocking(h.options)
    docking.dispose()
    expect(h.listenerCount()).toBe(0)
    // The resolve that was already deferred must not run after disposal.
    h.flush()
    expect(h.placed).toEqual([])
    docking.dispose()
  })

  it('ignores a signal that arrives after disposal', () => {
    const h = harness()
    const docking = createDocking(h.options)
    h.flush()
    docking.dispose()
    const placed = h.placed.length
    h.setInventory([])
    h.dom.document.dispatchEvent({ type: 'click' })
    h.flush()
    expect(h.placed).toHaveLength(placed)
  })
})

describe('the deferred resolve', () => {
  it('uses the deferrer it was given, so a test owns the timing', () => {
    const defer = vi.fn<(work: () => void) => void>()
    const h = harness()
    const docking = createDocking({ ...h.options, defer })
    expect(defer).toHaveBeenCalledTimes(1)
    docking.dispose()
  })
})
