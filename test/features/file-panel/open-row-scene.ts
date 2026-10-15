/**
 * A whole installed file panel over the DOM stand-in, so the *real* call point
 * for opening a file row can be driven without a browser.
 *
 * `open-file.test.ts` pins the decision, but a decision is not what a reader
 * clicks. What runs on a click is `openRow` in `index.ts`, and it is the only
 * place that assembles the four facts the decision takes, including the one
 * that is not data at all: whether the acting tab is docked, read out of the
 * docking kit's own `data-dockkit-*` anchors. Checking "this tab can lend a
 * slot" against the DOM therefore needs the DOM the shell actually renders,
 * which is what this file draws.
 *
 * What is real here: the install path, the panel's mount and docking loop, the
 * renderer's own callback object, `openRow`, `planOpenFile`,
 * `applyOpenFilePlan`, and every `sidebarRight` call. What is substituted: the
 * two React-side pieces that cannot load in plain Node: `react-dom/client`,
 * which the test file mocks so the element handed to the root can be read (its
 * `onOpen` prop *is* the call point), and the primitives package the view draws
 * its icons with.
 *
 * The scene is drawn the way the kit draws it: one `[data-dockkit-host]` per
 * tab, docked or floating, holding a `[data-dockkit-content="<tabId>"]`
 * section, with the sidebar's `[data-sidebar-right-tab="<tabId>"]` wrapper
 * inside it. That nesting is what makes `isDocked`'s `closest` walk mean
 * something rather than being decorative.
 *
 * The sidebar's own placement rules are simulated rather than stubbed, because
 * three of the four behaviours under test are about what happens *after* a
 * call: `replaceTab` takes the replaced tab's slot and closes it in the same
 * entry (upstream `stores.ts`, the `openContent` intent planner), an address
 * that is already open is focused instead, and a plain open appends a tab that
 * settles as the active one. Without that, "click file after file without
 * going back to the file list" could not be checked at all.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/open-row-scene
 */

import type { FakeDom } from '../../helpers/dom.ts'
import type { RecordingScope } from '../../helpers/scope.ts'
import type { FakeNode } from './fake-host-dom.ts'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { install } from '../../../src/client/features/file-panel/index.ts'
import { PANEL_CONTAINER_ATTRIBUTE, PANEL_HOST_ATTRIBUTE } from '../../../src/client/features/file-panel/panel-host.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { createRecordingScope } from '../../helpers/scope.ts'

/** One tab the scene's sidebar holds, and where the kit draws it. */
interface SceneTab {
  /** The tab record's id. */
  readonly id: string
  /** The tab's kind; `files` is the file list's own page kind. */
  readonly kind: string
  /**
   * The address the tab shows. `files` is the file-list page's address; anything
   * else here is treated as a workspace-relative path and addressed through the
   * host's own `fileAddressFor`, so a test states a path rather than an encoding.
   */
  readonly contentId: string
  /** Whether the kit draws this tab floating, which is what makes it lend no slot. */
  readonly floating?: boolean
  /** Whether the shell has rendered a host element for this tab at all. */
  readonly rendered?: boolean
}

/** One sidebar: one session, its workspace root, its tabs, and which tab is active. */
export interface Scene {
  /** The session the panel is looking at. */
  readonly sessionId: string
  /** The session's workspace root, or undefined when it has none. */
  readonly workspaceRoot: string | undefined
  /** Every tab open in the session, in strip order. */
  readonly tabs: readonly SceneTab[]
  /** The id of the tab the sidebar reports as active. */
  readonly activeTabId: string
}

/** Every sidebar call the gesture made, in order. */
interface SidebarCalls {
  /** One entry per open, with the placement it carried and the method used. */
  readonly opened: {
    readonly via: 'openResourceIn' | 'openResource'
    readonly sessionId: string
    readonly address: string
    readonly replaceTab: string | undefined
  }[]
  /** Tab ids passed to `focus`, in order. */
  readonly focused: string[]
  /** Tab ids passed to `closeIn`, in order. */
  readonly closed: string[]
  /** The active tab at the moment of each `closeIn`, so an emptied pane is visible. */
  readonly activeAtClose: (string | undefined)[]
  /** The same calls as one ordered log, so "focus before close" is checkable. */
  readonly order: string[]
}

/** The props the panel hands its renderer; `onOpen` is the real call point. */
export interface RenderProps {
  /** Open one file row, exactly as a click on it does. */
  readonly onOpen: (path: string) => void
}

/** A mounted, installed panel over one scene. */
export interface OpenRowScene {
  /** The stand-in document, so a test can inspect the page the panel patched. */
  readonly document: FakeDom['document']
  /** The sidebar calls the gesture made. */
  readonly calls: SidebarCalls
  /** Every effect label the install took, so disposal is traceable. */
  readonly scope: RecordingScope
  /** The tabs the sidebar holds right now, as its inventory reports them. */
  readonly tabs: () => readonly { readonly id: string, readonly kind: string, readonly contentId: string }[]
  /** The tab record the sidebar reports as active right now. */
  readonly activeTab: () => { readonly id: string, readonly kind: string, readonly contentId: string }
  /**
   * Click one file row.
   * @param path - the file's absolute path, as the panel's tree spells it.
   */
  readonly open: (path: string) => void
  /** The panel's container elements, as the document currently holds them. */
  readonly containers: () => unknown[]
  /**
   * The tab id of the panel's current home, read off the host's own anchors.
   * @returns the id, or undefined when the panel is off the page.
   */
  readonly homeTabId: () => string | undefined
  /** How the panel currently sits in its home, or undefined when it has none. */
  readonly homeMode: () => string | undefined
  /** Let the deferred docking resolve and any listing settle. */
  readonly settle: () => Promise<void>
  /**
   * Make another tab the active one and let the panel re-dock, as the shell
   * does after a store commit.
   * @param tabId - the tab that becomes active.
   */
  readonly activate: (tabId: string) => Promise<void>
  /** Release everything the install took, and uninstall the stand-in globals. */
  readonly unload: () => void
}

/** One observable snapshot the panel subscribes to, with its listeners. */
function observable<Value>(initial: Value): {
  readonly getSnapshot: () => Value
  readonly subscribe: (listener: () => void) => () => void
  readonly set: (next: Value) => void
} {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * Install the file panel over one scene and hand back the call point.
 * @param scene - the session, workspace, tabs and active tab to draw.
 * @param latest - reads the element the mocked React root was last asked to render.
 * @returns the installed panel and its observation faces.
 */
export function openRowScene(scene: Scene, latest: () => RenderProps | undefined): OpenRowScene {
  const dom = createFakeDom()
  const restore = dom.install()
  const { document } = dom

  /** Address one scene tab stands for; a path is addressed by the host's own builder. */
  const addressOf = (tab: SceneTab): string =>
    tab.contentId === 'files' || tab.contentId.startsWith('dsh-resource://')
      ? tab.contentId
      : fileAddressFor(scene.sessionId, scene.workspaceRoot, tab.contentId)

  /** Every open tab, in strip order; a tab record as the sidebar publishes it. */
  let records = scene.tabs.map(tab => ({
    id: tab.id,
    kind: tab.kind,
    contentId: addressOf(tab),
    title: tab.id,
  }))
  /** The session-qualified inventory the docking reads, which is a different shape. */
  let openTabs = records.map(record => ({
    sessionId: scene.sessionId,
    tabId: record.id,
    kind: record.kind,
    contentId: record.contentId,
  }))
  let activeId = scene.activeTabId
  let minted = 0

  /** The kit's cell for one tab: a fresh element per tab id, as React keys them. */
  const cells = new Map<string, FakeNode>()

  /** Take one tab's cell off the page, as closing or replacing its record does. */
  const undrawCell = (tabId: string): void => {
    const host = cells.get(tabId)
    if (host === undefined)
      return
    host.remove()
    cells.delete(tabId)
  }

  /** Draw one tab's host cell the way the kit does, replacing any cell for it. */
  const drawCell = (tabId: string, floating: boolean): void => {
    undrawCell(tabId)
    const host = document.createElement('div')
    host.setAttribute('data-dockkit-host', floating ? 'float' : 'dock')
    const content = document.createElement('section')
    content.setAttribute('data-dockkit-content', tabId)
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-sidebar-right-tab', tabId)
    content.appendChild(wrapper)
    host.appendChild(content)
    document.body.appendChild(host)
    cells.set(tabId, host)
  }

  for (const tab of scene.tabs) {
    if (tab.rendered !== false)
      drawCell(tab.id, tab.floating === true)
  }

  const scope = createRecordingScope()
  const calls: SidebarCalls = { opened: [], focused: [], closed: [], activeAtClose: [], order: [] }
  const onScreen = observable<string | undefined>(scene.sessionId)
  const inventory = observable(openTabs)

  /** Publish the sidebar's inventory after a mutation, which is what wakes the panel. */
  const publish = (): void => {
    openTabs = records.map(record => ({
      sessionId: scene.sessionId,
      tabId: record.id,
      kind: record.kind,
      contentId: record.contentId,
    }))
    inventory.set(openTabs)
  }

  /**
   * Place an open the way the session's own store does.
   *
   * One entry carries the whole open: a replaced tab lends its pane and slot and
   * is closed in the same step, an address that is already open is focused
   * instead, and everything else appends a tab that settles as the active one.
   */
  const placeOpen = (address: string, replaceTab: string | undefined): void => {
    const revealed = records.find(record => record.contentId === address)
    if (revealed !== undefined) {
      activeId = revealed.id
      if (replaceTab !== undefined && replaceTab !== revealed.id) {
        records = records.filter(record => record.id !== replaceTab)
        undrawCell(replaceTab)
      }
      publish()
      return
    }
    minted += 1
    const id = `tab-n${minted}`
    if (replaceTab === undefined) {
      records = [...records, { id, kind: 'text', contentId: address, title: address }]
      drawCell(id, false)
    }
    else {
      // The slot survives; the record does not, so the kit keys a fresh cell for
      // the new id and the replaced one stops existing.
      records = records.map(record => record.id === replaceTab
        ? { id, kind: 'text', contentId: address, title: address }
        : record)
      drawCell(id, false)
      undrawCell(replaceTab)
    }
    activeId = id
    publish()
  }

  const ctx = {
    effect: scope.effect,
    locale: {
      bind: () => (key: string) => key,
      register: () => () => {},
    },
    slots: {
      inject: (_slot: string, contribute: () => unknown) => {
        contribute()
        return () => {}
      },
      register: () => () => {},
    },
    sidebarRightTabs: {
      register: () => () => {},
    },
    sidebarRight: {
      mounted: onScreen,
      openTabs: inventory,
      active: () => records.find(record => record.id === activeId),
      tabsIn: () => records,
      openResourceIn: (sessionId: string, address: string, options?: { replaceTab?: string }) => {
        calls.opened.push({ via: 'openResourceIn', sessionId, address, replaceTab: options?.replaceTab })
        calls.order.push(`open ${address} replace=${String(options?.replaceTab)}`)
        placeOpen(address, options?.replaceTab)
      },
      openResource: (address: string, options?: { replaceTab?: string }) => {
        calls.opened.push({ via: 'openResource', sessionId: scene.sessionId, address, replaceTab: options?.replaceTab })
        calls.order.push(`open ${address} replace=${String(options?.replaceTab)}`)
        placeOpen(address, options?.replaceTab)
      },
      focus: (tabId: string) => {
        calls.focused.push(tabId)
        calls.order.push(`focus ${tabId}`)
        activeId = tabId
        publish()
      },
      closeIn: (sessionId: string, tabId: string) => {
        calls.closed.push(tabId)
        calls.activeAtClose.push(records.find(record => record.id === activeId)?.id)
        calls.order.push(`close ${sessionId} ${tabId}`)
        records = records.filter(record => record.id !== tabId)
        undrawCell(tabId)
        publish()
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({
          byId: scene.workspaceRoot === undefined ? {} : { [scene.sessionId]: { cwd: scene.workspaceRoot } },
        }),
      },
    },
    remote: {
      workspaceFiles: {
        list: () => Promise.resolve({ ok: true, value: { entries: [], truncated: false } }),
        changes: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }) }),
      },
      $stream: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }),
        dispose: () => Promise.resolve(),
      }),
    },
  }

  install(ctx as never)

  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  return {
    document,
    calls,
    scope,
    tabs: () => records,
    activeTab: () => {
      const record = records.find(entry => entry.id === activeId)
      if (record === undefined)
        throw new Error(`no open tab is ${activeId}`)
      return record
    },
    open: (path) => {
      const props = latest()
      if (props === undefined)
        throw new Error('the panel never handed its renderer a view, so there is no row to click')
      props.onOpen(path)
    },
    containers: () => [...document.querySelectorAll(`[${PANEL_CONTAINER_ATTRIBUTE}]`)],
    homeTabId: () => {
      const container = document.querySelector(`[${PANEL_CONTAINER_ATTRIBUTE}]`)
      const wrapper = container?.closest('[data-sidebar-right-tab]')
      return wrapper?.getAttribute('data-sidebar-right-tab') ?? undefined
    },
    homeMode: () => {
      const container = document.querySelector(`[${PANEL_CONTAINER_ATTRIBUTE}]`)
      const host = container?.closest(`[${PANEL_HOST_ATTRIBUTE}]`)
      return host?.getAttribute(PANEL_HOST_ATTRIBUTE) ?? undefined
    },
    settle,
    async activate(tabId) {
      activeId = tabId
      // A tab switch reaches the panel through the sidebar's own sources; the
      // kit's layout changing without a publish is not a state it ever sees.
      publish()
      onScreen.set(scene.sessionId)
      await settle()
    },
    unload: () => {
      scope.disposeAll()
      restore()
    },
  }
}
