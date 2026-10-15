/**
 * The three menu items, contributed through the official tab-menu slot.
 *
 * Everything this module reaches the host through is a plain function, so the
 * contribution can be exercised with a stand-in and "unload leaves nothing
 * behind" becomes a checked claim. `index.ts` supplies the real functions by
 * adapting the client context; the tests supply recording ones. Beyond the
 * element handed to the menu primitive, this module knows nothing about cordis
 * or React's tree.
 *
 * Two host facts shape the wiring:
 *
 * - A tab record carries no order, so the strip's markup is the order source,
 *   and it is read when a row acts rather than when the row is registered. A
 *   registration is a component serving every tab of every Session; only at
 *   action time is the answer still current.
 * - The read and the close must name the same Session. Closing acts on the
 *   mounted Session, so the read is bounded by the mounted Session too. A
 *   retained background Session is in the document as well, and its tabs are
 *   not this menu's to close.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions/menu
 */

import type { TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { ReactElement } from 'react'
import type { Disposer } from '../../effect.ts'
import type { TabActionsKey } from './locales.ts'
import type { KindRecord, ReadableRoot } from './order.ts'
import type { CloseSets, OrderedTab } from './targets.ts'
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement } from 'react'
import { en, NS, zh } from './locales.ts'
import { combineOrder, readPlacements } from './order.ts'
import { closeTargets, hostClosable } from './targets.ts'

/** The three menu items' ids. A `list` slot keys its cells by `id`, so they must be distinct and stable. */
export const MENU_IDS = {
  others: 'dsh-tweaks:close-others',
  left: 'dsh-tweaks:close-left',
  right: 'dsh-tweaks:close-right',
} as const

/**
 * The share of the runtime props this feature's rows actually read.
 *
 * Narrow on purpose: the row needs the tab, the dismissal, and the translate
 * seat, and nothing else the session-scoped standard kit carries. A function of
 * this shape is what registers, because the framework's full runtime props
 * satisfy it, and stating it here is what lets a test drive a row with three
 * fields rather than a fabricated copy of the whole seat.
 */
interface MenuItemRowProps {
  /** The tab whose menu is open. */
  readonly tab: TabRecord
  /** Dismiss the menu without acting. */
  readonly dismiss: () => void
  /** Translate a key of this feature's namespace. */
  readonly t: (key: TabActionsKey) => string
}

/** A registered row: what the slot framework renders when the menu opens on a tab. */
export type MenuItemComponent = (props: MenuItemRowProps) => ReactElement

/** The options one menu item is registered under. */
export interface MenuItemRegistration {
  /** The slot the row contributes into. */
  readonly name: 'sidebar.right.tab.menu.item'
  /** The list-cell id, unique within the slot. */
  readonly id: string
  /** The dictionary namespace backing the row's `t` seat. */
  readonly locale: typeof NS
}

/** The dictionaries this feature registers, keyed by locale. */
const DICTIONARIES: Record<'zh' | 'en', Record<TabActionsKey, string>> = { zh, en }

/** Which dictionary key each action's row reads. */
const LABEL_KEYS = {
  others: 'menu.closeOthers',
  left: 'menu.closeLeft',
  right: 'menu.closeRight',
} as const satisfies Record<keyof CloseSets, TabActionsKey>

/**
 * Everything this feature needs from the host, as plain functions.
 *
 * Stated narrowly so a stand-in can supply it without imitating cordis, and so
 * the full list of what this feature takes stays readable in one place.
 */
export interface TabActionsHost<K extends string = string> {
  /**
   * Run `body` in the plugin's effect scope and own what it returns.
   * @param body - installs a resource and returns its disposer.
   * @param label - diagnostic name for the effect.
   */
  effect: (body: () => Disposer, label: string) => void
  /**
   * Wait for the tab-menu slot to be declared, then contribute in the caller's
   * effect scope.
   * @param contribute - registers the entity and returns its disposer.
   * @returns the disposer that cancels the wait and releases the contribution.
   */
  onMenuSlot: (contribute: () => Disposer) => Disposer
  /**
   * Register one menu-item row into the tab-menu slot.
   * @param options - the slot, the list-cell id, and the dictionary namespace.
   * @param component - the row to render.
   * @returns the disposer that removes the registration.
   */
  registerItem: (options: MenuItemRegistration, component: MenuItemComponent) => Disposer
  /**
   * Register this feature's dictionaries.
   * @param dicts - the dictionaries, keyed by locale.
   * @returns the disposer that removes them.
   */
  registerDictionary: (dicts: Record<'zh' | 'en', Record<TabActionsKey, string>>) => Disposer
  /** The document the sidebar drew into, or undefined where there is none. */
  document: () => ReadableRoot | undefined
  /** The Session whose sidebar is on screen, or undefined when none is. */
  mountedSession: () => K | undefined
  /**
   * The open tab records of one Session.
   * @param sessionId - the Session to read.
   * @returns its records.
   */
  tabsIn: (sessionId: K) => readonly KindRecord[]
  /**
   * Close one tab of the on-screen Session.
   * @param tabId - the tab to close.
   */
  close: (tabId: TabId) => void
}

/**
 * Read the current strip order.
 * @param host - where the document, the Session and the records come from.
 * @returns the ordered tabs at call time, or an empty list when nothing is drawn.
 */
function readOrder(host: TabActionsHost<string>): readonly OrderedTab[] {
  const document = host.document()
  const sessionId = host.mountedSession()
  if (document === undefined || sessionId === undefined)
    return []
  return combineOrder(readPlacements(document, sessionId), host.tabsIn(sessionId))
}

/**
 * Contribute one menu item that closes its own target set.
 *
 * The set is recomputed on activation, so a strip that changed while the menu
 * was open still gets the right tabs. The row is disabled, never absent, when
 * the set is empty: the action's existence is the point.
 * @param host - the host to contribute through.
 * @param action - which of the three sets this item closes.
 * @param id - the list-cell id, unique within the slot.
 */
function contribute(host: TabActionsHost<string>, action: keyof CloseSets, id: string): void {
  host.effect(() => host.onMenuSlot(() => host.registerItem({ name: 'sidebar.right.tab.menu.item', id, locale: NS }, (props: MenuItemRowProps) => {
    const { tab, dismiss, t } = props
    const tabs = readOrder(host)
    const targets = closeTargets(tabs, tab.id, hostClosable(tabs))[action]
    return createElement(MenuItemButton, {
      disabled: targets.length === 0,
      // Dismiss first: the menu is the kit's and closes on the kit's own items
      // only, and a row that acted must not leave a menu floating over the tabs
      // the close just replaced.
      onSelect: () => {
        dismiss()
        for (const target of targets) host.close(target.id)
      },
      children: t(LABEL_KEYS[action]),
    })
  })), `dsh-tweaks: tab-actions ${action}`)
}

/**
 * Register the dictionaries and the three rows.
 *
 * Every effect is labelled, so an unload can be traced to the contribution it
 * releases.
 * @param host - the host to contribute through.
 */
export function writeMenu(host: TabActionsHost<string>): void {
  host.effect(() => host.registerDictionary(DICTIONARIES), 'dsh-tweaks: tab-actions dictionaries')
  contribute(host, 'others', MENU_IDS.others)
  contribute(host, 'left', MENU_IDS.left)
  contribute(host, 'right', MENU_IDS.right)
}
