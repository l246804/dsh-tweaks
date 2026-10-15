/**
 * Keeping the panel docked in whatever tab is on screen.
 *
 * The panel renders in none of the tabs it serves: a file tab's body belongs to
 * the preview plugin, and the file-list page's body belongs to this plugin but is
 * only one of the panel's two homes. Getting one container into whichever is
 * showing is therefore a DOM patch, which ADR-0002 allows for exactly this case
 * ("跨 tab 单一实例的面板") and which is why the anchors it reads are the host's
 * own `data-*` attributes rather than class names or DOM positions.
 *
 * The hard part is *when* to look. A tab switch is not one event: the layout
 * commits, React re-renders the pane, and only then does the new body element
 * exist. So this module does not guess a delay. It collects the signals that can
 * accompany a switch (a session change, the open-tab inventory changing, a
 * click or a focus landing inside the sidebar) and re-resolves the target
 * after* the current task, when the shell's render has committed. A resolve that
 * finds nothing is not an error: it means nothing is on screen to dock into, and
 * the next signal will look again.
 *
 * The decision itself is a pure function of two snapshots, which is what keeps
 * the interesting cases (no session, no active tab, a tab that is not rendered
 * yet) testable without a browser.
 *
 * ## Fallback nature, and what replaces this module
 *
 * The watching half is a DOM patch under
 * `docs/adr/0002-official-channels-first.md`, and it exists only because the
 * placement it watches for cannot be learned from a service. The signals it
 * collects (the open-tab inventory, the on-screen session, and a click or focus
 * landing in the sidebar) are the best available proxies for "the kit has now
 * rendered a different tab body"; a subscription that simply reported the
 * rendered placement would replace all of them. Upstream already publishes the
 * first two, so the seam to delete is narrow: add a placement source (a
 * `sidebarRight` signal naming the tab on screen *and* the element its body was
 * rendered as), and this module's `refresh`, its deferred resolve and its two
 * gesture listeners all go with it, leaving `resolveDockTarget` as the only
 * part worth keeping. Until then, the signals below are the seam to keep
 * correct.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/docking
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { findTabBody } from './tab-anchor.ts'

/** One open tab, as the sidebar's inventory reports it. */
export interface OpenTab {
  /** The session the tab belongs to. */
  readonly sessionId: SessionId
  /** The tab record's id. */
  readonly tabId: TabId
  /** The tab's kind. */
  readonly kind: string
  /** The address the tab shows. */
  readonly contentId: string
}

/** The tab the panel should be docked in, if any. */
export interface DockTarget {
  /** The session whose workspace the panel lists. */
  readonly sessionId: SessionId
  /** The tab record the panel belongs beside. */
  readonly tabId: TabId
  /** The tab's kind. */
  readonly kind: string
  /** The address the tab navigated to. */
  readonly address: string
  /** The session's workspace root, or undefined when its header carries no cwd. */
  readonly workspaceRoot: string | undefined
}

/** The sidebar facts a resolve reads; `ctx.sidebarRight` and the session list satisfy it. */
export interface SidebarFacts {
  /** The on-screen session, or undefined while none is. */
  readonly onScreenSession: () => SessionId | undefined
  /**
   * The active tab of the active pane.
   * @returns the record, or undefined with no tab on screen.
   */
  readonly activeTab: () => { readonly id: TabId, readonly kind: string, readonly contentId: string } | undefined
  /**
   * One session's workspace root, as its catalog row reports it.
   * @param sessionId - the session.
   * @returns the cwd, or undefined when it has none.
   */
  readonly workspaceRootOf: (sessionId: SessionId) => string | undefined
}

/**
 * Decide which tab the panel belongs in right now.
 *
 * The on-screen session is the authority, not the active tab's own `sessionId`:
 * the panel lists *the workspace the reader is looking at*, and a tab retained in
 * a background session is not on screen at all. The inventory row is consulted
 * only to carry the tab's kind, which the page/`dock` decision needs and which
 * `active()` does not report.
 * @param facts - the two snapshots and the workspace lookup.
 * @param inventory - the open-tab inventory, as the sidebar publishes it.
 * @returns the target, or undefined when nothing is on screen to dock beside.
 */
export function resolveDockTarget(facts: SidebarFacts, inventory: readonly OpenTab[]): DockTarget | undefined {
  const sessionId = facts.onScreenSession()
  if (sessionId === undefined)
    return undefined
  const active = facts.activeTab()
  if (active === undefined)
    return undefined
  // The inventory is the only source of the tab's kind; a record the inventory
  // has not published yet is a tab mid-open, and the next signal will catch it.
  const row = inventory.find(tab => tab.sessionId === sessionId && tab.tabId === active.id)
  return {
    sessionId,
    tabId: active.id,
    kind: row?.kind ?? active.kind,
    // The address comes from the active record and the kind from the inventory:
    // `contentId` is what the tab was navigated to, and the two agree.
    address: active.contentId,
    workspaceRoot: facts.workspaceRootOf(sessionId),
  }
}

/**
 * The document surface the docking reads.
 *
 * Named structurally, and deliberately narrower than `Document`: a real document
 * satisfies it directly, so no cast appears at the call site, and the surface
 * states exactly what the docking asks of the page: one query and two listener
 * pairs. `tab-anchor.ts` explains why the query is by attribute.
 */
export interface DockingDocument {
  /**
   * Find the first matching element.
   * @param selector - selector text.
   * @returns the element, or null.
   */
  readonly querySelector: (selector: string) => unknown
  /**
   * Observe one event type on the document.
   * @param type - the event type.
   * @param listener - the handler.
   */
  readonly addEventListener: (type: string, listener: (event: unknown) => void) => void
  /**
   * Stop observing one event type.
   * @param type - the event type.
   * @param listener - the handler passed to `addEventListener`.
   */
  readonly removeEventListener: (type: string, listener: (event: unknown) => void) => void
}

/** What the docking needs to do its work. */
export interface DockingOptions {
  /** The document the tab bodies live in. */
  readonly document: DockingDocument
  /** The sidebar facts to resolve against. */
  readonly facts: SidebarFacts
  /** The open-tab inventory source. */
  readonly inventory: {
    readonly getSnapshot: () => readonly OpenTab[]
    readonly subscribe: (listener: () => void) => () => void
  }
  /** The on-screen session source. */
  readonly onScreen: {
    readonly getSnapshot: () => string | undefined
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * Run `work` after the current task, when the shell's render has committed.
   * @param work - the deferred work.
   */
  readonly defer: (work: () => void) => void
  /**
   * Dock the panel into one tab body, or take it off the page.
   * @param target - the resolved target, or undefined when nothing is on screen.
   * @param element - the element the target's body is rendered as, when it has one.
   */
  readonly place: (target: DockTarget | undefined, element: Element | undefined) => void
}

/** The docking loop. */
export interface Docking {
  /** Resolve and place the panel now; safe to call at any time. */
  readonly refresh: () => void
  /** Stop listening and cancel any deferred resolve. */
  readonly dispose: () => void
}

/**
 * Start keeping the panel docked.
 * @param options - the document, the facts, the sources, the deferrer and the placer.
 * @returns the loop.
 */
export function createDocking(options: DockingOptions): Docking {
  const { document, facts, inventory, onScreen, defer, place } = options
  let pending = false
  let disposed = false

  /** Apply one resolve, remembering what the shell last reported. */
  let lastKey: string | undefined
  const resolve = (): void => {
    pending = false
    if (disposed)
      return
    const target = resolveDockTarget(facts, inventory.getSnapshot())
    // The element is looked up fresh every time: the shell replaces a tab's body
    // element on re-render, and a cached one would be detached within a frame.
    const element = target === undefined ? undefined : findTabBody(document, target.tabId)
    const key = target === undefined
      ? 'none'
      : `${target.sessionId}\u0000${target.tabId}\u0000${target.address}\u0000${target.workspaceRoot ?? ''}\u0000${element === undefined ? 'absent' : 'present'}`
    // A repeat of the same target is what a spurious click or a store commit
    // produces; skipping it is what keeps a reveal from being re-run.
    if (key === lastKey)
      return
    lastKey = key
    place(target, element)
  }

  /** Ask for one resolve after the current task. */
  const schedule = (): void => {
    if (pending || disposed)
      return
    pending = true
    defer(resolve)
  }

  const unsubscribes = [
    inventory.subscribe(schedule),
    onScreen.subscribe(schedule),
  ]
  // A tab switch that only moves focus publishes nothing, so the two gestures
  // that move it (a click and a focus landing in the sidebar) are the other
  // signals. Both are deferred, because the body element is rendered after the
  // event that selected it.
  const onGesture = (): void => {
    schedule()
  }
  document.addEventListener('click', onGesture)
  document.addEventListener('focusin', onGesture)
  schedule()

  return {
    refresh: schedule,
    dispose() {
      disposed = true
      for (const unsubscribe of unsubscribes) unsubscribe()
      document.removeEventListener('click', onGesture)
      document.removeEventListener('focusin', onGesture)
    },
  }
}
