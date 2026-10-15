/**
 * Tab actions in the right sidebar's tab menu.
 *
 * The host offers one action per tab (close), and none for a range. This
 * feature registers three list items through the official tab-menu extension
 * point, computes each one's target set from the strip's own order, and renders
 * an item disabled rather than hidden when it has nothing to act on, so the
 * action's existence stays visible.
 *
 * The work is split so each part can be checked on its own: `targets.ts`
 * decides the close sets, `order.ts` reads the strip's markup, `menu.ts`
 * contributes the three rows over {@link TabActionsHost}, and `locales.ts`
 * carries the copy. This module supplies that host from the client context,
 * which is the only thing here that knows about cordis.
 *
 * The host is stated as its own interface rather than passing the whole context
 * in, so the feature's footprint on the client is one readable list, and so the
 * contribution can be exercised with a recording stand-in instead of only its
 * decisions. Session ids are plain strings on that interface and branded on the
 * host; this adapter is where the two meet, which is the one place a cast
 * belongs.
 *
 * Owned by ticket #7.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions
 */

// Type-only: pulls the `ctx.slots` service merge. Erased before bundling, so
// `ui-renderer` never becomes a runtime import of this module.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ClientContext } from '../../contracts.ts'
import type { TabActionsHost } from './menu.ts'
import type { ReadableRoot } from './order.ts'
import { NS } from './locales.ts'
import { writeMenu } from './menu.ts'

export { MENU_IDS, type MenuItemComponent, type MenuItemRegistration, type TabActionsHost } from './menu.ts'

/** The Session identity the sidebar reports, branded by the host. */
type SessionKey = Parameters<ClientContext['sidebarRight']['tabsIn']>[0]

/**
 * The page's document, or undefined where there is none.
 *
 * Read from the global rather than captured at install time: the plugin loads
 * once, and the document the sidebar drew into is whichever one the page has.
 * @returns the document, narrowed to what this feature reads.
 */
function pageDocument(): ReadableRoot | undefined {
  return typeof document === 'undefined' ? undefined : document
}

/**
 * Read the client context as the narrow host the menu takes.
 *
 * The document is read from the global rather than captured: the plugin loads
 * once, and the page's document is the one the sidebar drew into. Where no
 * document exists, as when the bundle is evaluated outside a browser, the read
 * is `undefined` and every row renders disabled instead of throwing.
 *
 * The sidebar face is reached through `ctx` inside each function rather than
 * captured as a value, because a cordis service resolves through a proxy bound
 * to the calling context.
 * @param ctx - the client root context.
 * @returns the host `writeMenu` takes.
 */
function hostOf(ctx: ClientContext): TabActionsHost {
  return {
    effect: (body, label) => { ctx.effect(body, label) },
    onMenuSlot: contribute => ctx.slots.inject('sidebar.right.tab.menu.item', contribute),
    registerItem: (options, component) => ctx.slots.register(options, component),
    registerDictionary: dicts => ctx.locale.register(NS, dicts),
    document: pageDocument,
    mountedSession: () => ctx.sidebarRight.mounted.getSnapshot(),
    tabsIn: sessionId => ctx.sidebarRight.tabsIn(sessionId as SessionKey),
    close: (tabId) => { ctx.sidebarRight.close(tabId) },
  }
}

/**
 * Install the tab-actions tweak.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  writeMenu(hostOf(ctx))
}
