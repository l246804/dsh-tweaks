/**
 * The panel's DOM face: one container, docked into whichever tab body is on
 * screen and *moved* rather than rebuilt when that changes.
 *
 * The whole feature rests on this one property. Expansion, loaded levels, the
 * filter word and the scroll offset all live somewhere else (a controller and
 * the React tree inside the container), and they survive a tab switch only
 * because the container element itself never is unmounted and re-created. A
 * fresh container per tab would silently produce a second tree with a second
 * set of subscriptions. That failure is the one this module exists to prevent, and the one
 * its tests assert by node identity.
 *
 * The host element is the tab body wrapper the shell already renders
 * (`[data-sidebar-right-tab]`); the panel marks it and adds one child, and the
 * marker is removed with the dock. Nothing else about the host's own markup is
 * touched, and the marker is what the plugin stylesheet keys the side-by-side
 * layout off.
 *
 * `HostDom` is a parameter rather than an import of the browser's `document`
 * for the usual reason: the same code then runs against this plugin's DOM
 * stand-in in a plain Node test, so "moved, not rebuilt" and "no residue after
 * unload" are checked claims instead of intentions.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/panel-host
 */

/** Marks the panel's own container element. */
export const PANEL_CONTAINER_ATTRIBUTE = 'data-dsh-tweaks-file-panel'

/** Marks the tab body the panel is currently docked in, and how it sits there. */
export const PANEL_HOST_ATTRIBUTE = 'data-dsh-tweaks-file-panel-host'

/** The panel's own scroller, so a caller can find it without knowing the tree's shape. */
export const PANEL_SCROLL_ATTRIBUTE = 'data-dsh-tweaks-file-panel-scroll'

/** The row marker: the absolute path each row stands for. */
export const ROW_PATH_ATTRIBUTE = 'data-dsh-files-path'

/** How the panel sits in its host. */
export type PanelMode
  /** The file-list page tab: the panel *is* the tab's content. */
  = | 'page'
  /** A file tab: the panel docks beside the file's content, and the content fills the rest. */
    | 'dock'

/** Where the panel currently sits. */
interface PanelLocation<Node> {
  /** The tab body element the container is a child of. */
  readonly host: Node
  /** How it sits there. */
  readonly mode: PanelMode
}

/**
 * The DOM operations the host performs, written so the browser's own `Element`
 * satisfies every one of them. Purpose-specific names (`ancestorWith`) instead
 * of a generic selector engine keep the stand-in honest: it implements exactly
 * what the panel asks for, and a new request has to be added here on purpose.
 */
export interface HostDom<Node> {
  /** Create one detached element. */
  readonly createElement: (tag: string) => Node
  /** Append a child at the end of a parent; a node with a parent is moved. */
  readonly append: (parent: Node, child: Node) => void
  /** Detach a node from its parent, if it has one. */
  readonly remove: (node: Node) => void
  /** The node's parent, or undefined at a root or when detached. */
  readonly parentOf: (node: Node) => Node | undefined
  /** The node's children, in document order. */
  readonly childrenOf: (node: Node) => readonly Node[]
  /** Write one attribute. */
  readonly setAttribute: (node: Node, name: string, value: string) => void
  /** Remove one attribute; an absent attribute is ignored. */
  readonly removeAttribute: (node: Node, name: string) => void
  /** Read one attribute, or undefined when absent. */
  readonly getAttribute: (node: Node, name: string) => string | undefined
  /** The nearest ancestor of `node` carrying `attribute`, or undefined. */
  readonly ancestorWith: (node: Node, attribute: string) => Node | undefined
}

/** The panel's DOM face. */
export interface PanelHost<Node> {
  /** The panel's container: the same node for this host's whole life. */
  readonly container: () => Node
  /** Where the panel is docked, or undefined while it is undocked. */
  readonly location: () => PanelLocation<Node> | undefined
  /**
   * Dock the panel into a tab body, moving the container when it is docked
   * elsewhere. Docking into the same host again is a no-op.
   * @param host - the tab body element to dock into.
   * @param mode - how the panel sits there.
   * @returns whether the container moved, so a caller can restore scroll only when it did.
   */
  readonly attach: (host: Node, mode: PanelMode) => boolean
  /** Undock without destroying: the container keeps every byte of its state, off the DOM. */
  readonly detach: () => void
  /** Undock, drop the container and clear every marker this face wrote. */
  readonly dispose: () => void
}

/**
 * Create the panel's DOM face.
 *
 * The container is created eagerly so its identity is decided here, once: a
 * caller may ask for `container()` before anything is docked (to render into
 * it) and get the node that will later be moved around.
 * @param dom - the DOM operations to work through.
 * @returns the host.
 */
export function createPanelHost<Node>(dom: HostDom<Node>): PanelHost<Node> {
  const container = dom.createElement('div')
  dom.setAttribute(container, PANEL_CONTAINER_ATTRIBUTE, '')
  let location: PanelLocation<Node> | undefined

  /** Stop marking a host element the panel has left. */
  const unmark = (host: Node): void => {
    dom.removeAttribute(host, PANEL_HOST_ATTRIBUTE)
  }

  return {
    container: () => container,
    location: () => location,
    attach(host, mode) {
      const current = location
      // Same host, same mode: nothing to do, and saying so keeps a caller from
      // re-running its scroll restoration on every render.
      if (current !== undefined && current.host === host && current.mode === mode)
        return false
      if (current !== undefined && current.host !== host)
        unmark(current.host)
      // `append` moves the container when it already has a parent, which is the
      // whole point: the node that carries the panel's state stays the same one.
      dom.append(host, container)
      dom.setAttribute(host, PANEL_HOST_ATTRIBUTE, mode)
      location = { host, mode }
      return true
    },
    detach() {
      const current = location
      if (current === undefined)
        return
      unmark(current.host)
      dom.remove(container)
      location = undefined
    },
    dispose() {
      this.detach()
      dom.remove(container)
    },
  }
}
