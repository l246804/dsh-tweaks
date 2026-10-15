/**
 * The docking kit's own anchors, named once, and the one reading of "is this
 * tab docked".
 *
 * Two features patch the page by reading the kit's markup: the file panel asks
 * whether the tab it serves sits on the docked surface, and the tab actions ask
 * the same of every open tab to compute their close sets. Both questions are the
 * same question, and both read the same handful of attributes, so the names, the
 * selector text and the answer live here rather than being spelled out at each
 * call site.
 *
 * The values are the kit's own `data-*` attributes, which are the stable anchors
 * ADR-0002 allows. Selector text is built through {@link attributeSelector} so
 * escaping a tab id has exactly one implementation, and the host attribute's
 * value is compared against the constants declared here rather than against a
 * literal written out again in a second place.
 *
 * This module only *names* and *reads* the anchors. Every patch that depends on
 * them states its own fallback nature where it decides to patch.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/dock-anchors
 */

import { attributeSelector } from './selector.ts'

/**
 * The anchor naming one tab's own `<section>`.
 *
 * The kit renders one of these for **every** tab record, selected or not,
 * docked or floating, which is what makes it the completeness source for "which
 * tabs exist on the page".
 */
export const DOCKKIT_CONTENT = 'data-dockkit-content'

/** The anchor stating where a tab stands: on the docked surface or in a floating pane. */
export const DOCKKIT_HOST = 'data-dockkit-host'

/** The anchor naming the floating pane that draws a tab. */
export const DOCKKIT_FLOAT = 'data-dockkit-float'

/** The anchor naming one chip of a pane's tab strip. */
export const DOCKKIT_TAB = 'data-dockkit-tab'

/** The anchor naming the chips container of one pane's strip, by pane id. */
export const DOCKKIT_STRIP_TABS = 'data-dockkit-strip-tabs'

/** The anchor wrapping a strip chip's label. Title chrome, never a body. */
const DOCKKIT_TAB_TITLE = 'data-dockkit-tab-title'

/** The anchor wrapping a floating pane's title. Title chrome, never a body. */
const DOCKKIT_FLOAT_TITLE = 'data-dockkit-float-title'

/** The anchor naming a floating pane's header, which holds its title. Title chrome. */
const DOCKKIT_FLOAT_GRIP = 'data-dockkit-float-grip'

/** The anchor the right sidebar writes on **both** of a tab's seats, carrying the tab id. */
const SIDEBAR_TAB = 'data-sidebar-right-tab'

/** The anchor the right sidebar writes on one session's panel, scope of every read. */
export const SIDEBAR_SESSION = 'data-sidebar-right-session'

/** The host value meaning a tab is drawn on the docked surface. */
export const DOCK_HOST = 'dock'

/** The host value meaning a tab is drawn in a floating pane of its own. */
export const FLOAT_HOST = 'float'

/** Where a tab is drawn: on the docked surface, or in an overlay pane of its own. */
export type TabHost = typeof DOCK_HOST | typeof FLOAT_HOST

/**
 * Read the kit's host attribute as where a tab stands.
 *
 * This is the one place that decides what the attribute's values *mean*: every
 * caller that needs "docked or floating" goes through it, whether it is asking
 * about one tab or every open tab. "Docked" is the default answer, which is the
 * conservative one: the kit writes exactly one of the two values today, and a
 * section whose attribute is missing would otherwise leave a caller with no
 * answer at all.
 * @param value - the `data-dockkit-host` value, or null when absent.
 * @returns where the tab is drawn.
 */
export function tabHostOf(value: string | null): TabHost {
  return value === FLOAT_HOST ? FLOAT_HOST : DOCK_HOST
}

/**
 * The containers a tab's *title* seat can live inside, by the kit's own
 * attributes.
 *
 * The first two are the title boxes themselves. The other three are the chrome
 * those boxes sit in. Any seat under one of them is the title, never the body.
 *
 * The lower three are redundant today and kept on purpose: the body is the
 * sidebar's own wrapper *beside* the pane's chrome, so no body seat can be
 * inside a chip or a strip, and the check survives a rename of the innermost
 * title box as long as the chrome keeps its anchors. Being wrong the other way
 * is expensive (the panel would render inside a tab label), so the judgement
 * asks five questions instead of one.
 */
export const TITLE_CONTAINER_SELECTORS: readonly string[] = [
  attributeSelector(DOCKKIT_TAB_TITLE),
  attributeSelector(DOCKKIT_FLOAT_TITLE),
  attributeSelector(DOCKKIT_TAB),
  attributeSelector(DOCKKIT_STRIP_TABS),
  attributeSelector(DOCKKIT_FLOAT_GRIP),
]

/**
 * The selector for one tab's own `<section>`, as the kit spells it.
 * @param tabId - the tab record's id.
 * @returns selector text.
 */
export function dockContentSelector(tabId: string): string {
  return attributeSelector(DOCKKIT_CONTENT, tabId)
}

/**
 * The selector for one tab's seats, as the right sidebar spells them.
 * @param tabId - the tab record's id.
 * @returns selector text.
 */
export function sidebarTabSelector(tabId: string): string {
  return attributeSelector(SIDEBAR_TAB, tabId)
}

/** The selector naming a tab's host element, which states whether it is docked. */
const DOCK_HOST_SELECTOR = attributeSelector(DOCKKIT_HOST)

/**
 * One element of the kit's markup, as an anchored read reaches it.
 *
 * The browser's own `Element` satisfies this structurally, and so does this
 * project's DOM stand-in, so the production read and the tested read are one
 * implementation.
 */
export interface HostAnchoredElement {
  /**
   * Read one attribute.
   * @param name - the attribute name.
   * @returns the value, or null when absent.
   */
  readonly getAttribute: (name: string) => string | null
  /**
   * Walk up to the nearest ancestor matching a selector, including this element.
   * @param selector - selector text.
   * @returns the match, or null.
   */
  readonly closest: (selector: string) => HostAnchoredElement | null
}

/** The document surface an anchored read needs. */
export interface TabAnchorScope {
  /**
   * Find the first matching element.
   * @param selector - selector text.
   * @returns the element, or null.
   */
  readonly querySelector: (selector: string) => HostAnchoredElement | null | undefined
}

/**
 * Whether one tab currently sits in a docked pane.
 *
 * The tab id is on the tab's own `<section>` and the answer is on the element
 * the kit wraps that section in, so the read is one query and one walk up. A tab
 * the shell has not rendered has no section at all, which is answered `false`
 * and is deliberately *not* run through {@link tabHostOf}: that function's
 * default exists for a host element that is present but unrecognized, while an
 * absent anchor means there is no tab here to ask about. Both callers want that
 * distinction, since each treats "not docked" as "cannot lend a slot or take a
 * side".
 * @param scope - the document to read.
 * @param tabId - the tab record's id.
 * @returns whether the tab is docked.
 */
export function isDockedTab(scope: TabAnchorScope, tabId: string): boolean {
  const host = scope.querySelector(dockContentSelector(tabId))?.closest(DOCK_HOST_SELECTOR)
  if (host === null || host === undefined)
    return false
  return tabHostOf(host.getAttribute(DOCKKIT_HOST)) === DOCK_HOST
}
