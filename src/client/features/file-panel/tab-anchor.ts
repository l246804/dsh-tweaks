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
 * ## Why the sidebar anchor alone is not enough
 *
 * The sidebar writes `data-sidebar-right-tab` on **two** seats of one tab: the
 * live chip title (`SidebarRight.tsx` renders a `<span>` for the
 * `sidebar.right.pane.tab.title` seat) and the body (a `<div>` for the
 * `sidebar.right.pane.tab` seat). Both seats are rendered under the one
 * `[data-dockkit-content]` section, and the title comes first, because the kit's
 * header precedes its body. A bare `querySelector` on that attribute therefore
 * returns the chip's label, and appending the panel there would put a file tree
 * inside a tab's title.
 *
 * The two seats are told apart by a second signal the host also writes itself:
 * the title seat is always inside the kit's own title box
 * (`[data-dockkit-tab-title]` for a strip chip, `[data-dockkit-float-title]` for
 * a floating pane's header). This module therefore keeps the seat that is **not**
 * under one of those, which is the body, rather than counting on a tag name or
 * on header-before-body order. Both of those are true today and neither is
 * promised; "inside the title box" is what the attribute means.
 *
 * ## Fallback nature, and what replaces this module
 *
 * This is a DOM patch under
 * `docs/adr/0002-official-channels-first.md`, for the case it names: a panel
 * that is one instance across several tabs cannot be rendered *by* the tab whose
 * body it shares, because that body belongs to the preview plugin, and no
 * official seat exists beside it. Delete this module when the host opens one:
 * either a pane-level slot beside a tab's content (a `sidebar.right.pane`
 * sibling seat rather than the per-tab `sidebar.right.pane.tab`), or a distinct
 * body anchor such as a separate `data-sidebar-right-tab-body` attribute, or a
 * tab definition declaring a container the kit reserves. Until then, the title
 * signal above is the seam to keep correct.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/tab-anchor
 */

/**
 * The anchor names, the selector text and the title-chrome list all come from
 * `dom/dock-anchors.ts`, which is the single description of the kit's markup;
 * the tab actions read the same attributes. What stays in this module is the one
 * judgement only the panel needs: which of a tab's two seats is its body.
 */
import type { HostAnchoredElement } from '../../dom/dock-anchors.ts'
import {
  dockContentSelector,
  sidebarTabSelector,
  TITLE_CONTAINER_SELECTORS,
} from '../../dom/dock-anchors.ts'

export { dockContentSelector, sidebarTabSelector }

/**
 * The narrow query surface this module needs: a root whose `querySelector`
 * returns a real element. `Document` satisfies it in the browser, and the
 * test stand-in's document satisfies it too.
 *
 * The document is the scope, not the section: {@link findTabBody} finds the
 * section *from* a root, so a scope that were the section itself would never
 * match it. Inside the section this module then uses the element's own
 * `querySelectorAll` and `closest`, which is why the root lookup has to yield a
 * genuine `Element` rather than anything selector-shaped.
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
 * The kit's per-tab `<section>` is the spine: it exists for every rendered tab
 * record, docked or floating, selected or not, and it is the only anchor that
 * names *one tab* rather than one kind of seat. Inside it, the sidebar gives the
 * tab id to both the chip's title seat and the body seat, so this picks the seat
 * that is not a title (see the module note) and ignores the rest. The section
 * itself is the fallback, which is also what a tab whose body is not mounted yet
 * gets: docking at the pane level is wrong-looking for a frame but never puts the
 * panel inside a label.
 * @param scope - the document to search.
 * @param tabId - the tab record's id.
 * @returns the element to dock into, or undefined when the tab is not rendered.
 */
export function findTabBody(scope: AnchorScope, tabId: string): Element | undefined {
  const section = scope.querySelector(dockContentSelector(tabId)) as Element | null | undefined
  if (section === null || section === undefined)
    return undefined
  return bodySeatIn(section, tabId) ?? section
}

/**
 * Find one tab's body seat inside its own section.
 *
 * The first seat with the tab id that is not a title wins. A tab can render
 * title and body, title alone (before its body is first visited) or body alone
 * (a tab in a pane the kit does not draw chrome for), so this asks for the
 * candidates rather than assuming either.
 * @param section - the tab's `[data-dockkit-content]` section.
 * @param tabId - the tab record's id.
 * @returns the body seat, or undefined when the section holds none.
 */
function bodySeatIn(section: Element, tabId: string): Element | undefined {
  for (const seat of section.querySelectorAll(sidebarTabSelector(tabId))) {
    if (!isTitleSeat(seat))
      return seat
  }
  return undefined
}

/**
 * Whether a seat is the tab's *title* rather than its body.
 *
 * The sidebar writes the tab id on both, so the kit's own title chrome is what
 * tells them apart. Walking up rather than testing the seat's own tag is
 * deliberate: the tag is `<span>` today and that is a rendering detail, while
 * "inside the title chrome" is what the seat being a title *means*.
 * @param seat - one element carrying the tab id.
 * @returns whether the seat is a title.
 */
function isTitleSeat(seat: HostAnchoredElement): boolean {
  return TITLE_CONTAINER_SELECTORS.some(selector => seat.closest(selector) !== null)
}
