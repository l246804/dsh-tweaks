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
 *   makes "move the container into it" a stable operation, and it is what pins
 *   every lookup below to *one tab* rather than to one kind of seat.
 * - `[data-sidebar-right-tab="<tabId>"]`: the wrapper the right sidebar puts
 *   around a tab body. It sits inside the section above and is where the panel's
 *   sibling content actually lives, so it is the element the panel's flex row
 *   belongs on.
 * - `[data-textpreview-state]`: the preview plugin's own root, one of
 *   `text` / `unsupported` / `loading`. It is the element a file tab's body is
 *   about, so it is where a docked panel goes: the preview's own toolbar is a
 *   row of that element's children, and the panel belongs beside the content
 *   under that row, not beside the wrapper that holds both.
 *
 * All three are `data-*` attributes the host writes itself, and the first two
 * carry the **tab id**, not an occurrence id and not a DOM position, so a
 * re-render that replaces the body element is still found. Class names are never
 * used: they carry a build hash.
 *
 * ## Why the lookup is scoped to the tab's own section
 *
 * The kit keeps a visited tab's body mounted, so several tabs can hold several
 * preview roots at once and all but one of them are off screen. A document-wide
 * query for the preview root would therefore dock the panel into whichever tab
 * happened to render first. Every lookup here starts from the section the tab id
 * names, which is what makes "this tab's preview" the question actually asked.
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
 * The anchor names and the selector text come from the `dom/` layer:
 * `host-anchors.ts` holds every host attribute spelling the plugin depends on,
 * and `dock-anchors.ts` builds the kit's selectors and the title-chrome list on
 * top of it; the tab actions read the same attributes. What stays in this module
 * is the two judgements only the panel needs: which of a tab's two seats is its
 * body, and that a docked panel hangs off the preview root rather than off that
 * seat.
 */
import type { HostAnchoredElement } from '../../dom/dock-anchors.ts'
import type { PanelMode } from './panel-host.ts'
import {
  dockContentSelector,
  sidebarTabSelector,
  TITLE_CONTAINER_SELECTORS,
} from '../../dom/dock-anchors.ts'
import { TEXT_PREVIEW_ANCHORS } from '../../dom/host-anchors.ts'
import { attributeSelector } from '../../dom/selector.ts'

export { dockContentSelector, sidebarTabSelector }

/**
 * The preview plugin's root, written by the preview itself.
 *
 * It is the element a file tab's content is *about*: the preview's toolbar is
 * one of its children and its body another, so a panel docked into the root sits
 * beside the content while the toolbar keeps its own row. The attribute is
 * present in all three of the preview's states (`text`, `unsupported`,
 * `loading`), so a dock does not depend on a file being readable.
 */
const PREVIEW_ROOT_ATTRIBUTE = TEXT_PREVIEW_ANCHORS.state.name

/** The selector naming a preview root, without regard to which state it is in. */
const PREVIEW_ROOT_SELECTOR = attributeSelector(PREVIEW_ROOT_ATTRIBUTE)

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
 * names *one tab* rather than one kind of seat. It is also what scopes the rest:
 * the kit keeps a visited tab's body mounted, so several tabs can hold preview
 * roots at once and a document-wide search would pick the wrong tab's.
 *
 * Inside that section the answer depends on the mode, because the two homes are
 * different elements:
 *
 * - **dock**: the preview root, so the panel lands beside the file's content and
 *   under the preview's own toolbar row. A tab whose body is not a preview (a
 *   non-text resource, a preview that has not rendered yet) falls back to the
 *   sidebar seat; the sidebar gives the tab id to *both* the chip's title seat
 *   and the body seat, so {@link bodySeatIn} picks the one that is not a title.
 * - **page**: the sidebar seat alone, which is where the file-list body this
 *   plugin itself renders lives.
 *
 * The section is the last fallback for either mode: docking at the pane level is
 * wrong-looking for a frame, but never puts the panel inside a label.
 * @param scope - the document to search.
 * @param tabId - the tab record's id.
 * @param mode - how the panel will sit there, which decides the host element.
 * @returns the element to dock into, or undefined when the tab is not rendered.
 */
export function findTabBody(scope: AnchorScope, tabId: string, mode: PanelMode): Element | undefined {
  const section = scope.querySelector(dockContentSelector(tabId)) as Element | null | undefined
  if (section === null || section === undefined)
    return undefined
  if (mode === 'dock') {
    const preview = section.querySelector(PREVIEW_ROOT_SELECTOR) as Element | null
    if (preview !== null)
      return preview
  }
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
