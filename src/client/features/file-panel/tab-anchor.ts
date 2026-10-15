/**
 * Finding the tab a panel should dock into, by the host's own stable anchors.
 *
 * The panel is one instance serving every file tab, and it renders in none of
 * the tabs it serves: a file tab's body belongs to the preview plugin. Getting
 * the container there is therefore a DOM patch, which ADR-0002 allows exactly for
 * this case ("跨 tab 单一实例的面板"), and which is why this module is careful
 * about *which* anchors it reads:
 *
 * - `[data-dockkit-content="<tabId>"]`: the per-tab `<section>` the docking kit
 *   renders for **every** tab record, selected or not, docked or floating. It is
 *   the one anchor that survives hiding, dragging and re-selection, which is what
 *   makes "move the container into it" a stable operation.
 * - `[data-sidebar-right-tab="<tabId>"]`: the wrapper the right sidebar puts
 *   around a tab body. It sits inside the section above and is where the panel's
 *   sibling content actually lives, so it is the element the panel's flex row
 *   belongs on.
 *
 * Both are `data-*` attributes the kit and the sidebar write themselves, and both
 * carry the **tab id**, not an occurrence id and not a DOM position, so a
 * re-render that replaces the body element is still found. Class names are never
 * used: they carry a build hash.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/tab-anchor
 */

/** The attribute the docking kit tags each tab's host section with. */
const DOCKKIT_CONTENT_ATTRIBUTE = 'data-dockkit-content'

/** The attribute the right sidebar tags each tab body wrapper with. */
const SIDEBAR_TAB_ATTRIBUTE = 'data-sidebar-right-tab'

/**
 * The selector for one tab's `<section>`, as the docking kit spells it.
 * @param tabId - the tab record's id.
 * @returns selector text.
 */
export function dockContentSelector(tabId: string): string {
  return `[${DOCKKIT_CONTENT_ATTRIBUTE}="${escapeAttribute(tabId)}"]`
}

/**
 * The selector for one tab's body wrapper, as the right sidebar spells it.
 * @param tabId - the tab record's id.
 * @returns selector text.
 */
export function sidebarTabSelector(tabId: string): string {
  return `[${SIDEBAR_TAB_ATTRIBUTE}="${escapeAttribute(tabId)}"]`
}

/**
 * The narrow query surface this module needs. `Document` and `Element` both
 * satisfy it, so the same code runs in the browser and in a test.
 */
export interface AnchorScope {
  /**
   * Find the first matching descendant.
   * @param selector - selector text.
   * @returns the element, or null.
   */
  readonly querySelector: (selector: string) => unknown
}

/**
 * Find the element the panel should dock into for one tab.
 *
 * The sidebar's own wrapper is preferred when it exists, because it is the
 * element the tab's *content* is inside: docking there is what puts the panel
 * beside the file rather than beside the pane. The kit's section is the fallback,
 * and it is always present for a live record, so a panel is never left without a
 * home while its tab exists.
 * @param scope - the document or element to search.
 * @param tabId - the tab record's id.
 * @returns the element to dock into, or undefined when the tab is not rendered.
 */
export function findTabBody(scope: AnchorScope, tabId: string): Element | undefined {
  const wrapper = scope.querySelector(sidebarTabSelector(tabId))
  if (wrapper !== null && wrapper !== undefined)
    return wrapper as Element
  const section = scope.querySelector(dockContentSelector(tabId))
  return section === null || section === undefined ? undefined : section as Element
}

/** Escape one value for the inside of a double-quoted attribute selector. */
function escapeAttribute(value: string): string {
  return value.replace(/(["\\])/gu, '\\$1')
}
