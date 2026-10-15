/**
 * Which tabs each menu action closes, decided from data alone.
 *
 * The host exposes closing one tab and nothing for a range, so all three
 * actions are this plugin's own arithmetic: a set computed from the strip's
 * order and then closed one call at a time. Keeping that arithmetic pure is
 * what makes "closes the right set, and only that set" a checkable claim
 * instead of a browser observation.
 *
 * Two facts from the host shape the rules here, and both are visible in the
 * types rather than read from code:
 *
 * - A tab's docked-or-floating state is a property of its pane, not of its
 *   record. A floating pane hosts exactly one tab and has no strip position, so
 *   neither "left" nor "right" means anything for it; such a tab is excluded
 *   from every set.
 * - Only the active pane's strip is in the document. A pane's own strip is
 *   therefore the only order this plugin can read, so a side stays inside the
 *   target's pane, while "others" spans every docked tab.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions/targets
 */

import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/**
 * The tab kind the guide page is registered under.
 *
 * Upstream keeps this literal to itself (`ui-sidebar-right`'s `GUIDE_KIND`), so
 * this plugin states it rather than importing another plugin's module. It is
 * the one kind whose closability the host restricts.
 */
const GUIDE_KIND = 'guide'

/** Where a tab is drawn: on the docked strip, or in an overlay pane of its own. */
export type TabHost = 'dock' | 'float'

/** One tab as this feature needs it: identity, kind, and where it stands. */
export interface OrderedTab {
  /** The tab's id, as the strip's own DOM anchor reports it. */
  readonly id: TabId
  /** The record's kind, or `undefined` when the host has no record for the id. */
  readonly kind: string | undefined
  /** Whether the tab sits on the docked surface or floats. */
  readonly host: TabHost
  /**
   * The docked pane holding the tab, or `undefined` when it could not be read
   * (a floating tab, or a docked tab in a pane whose strip is not rendered
   * because that pane is not the active one).
   */
  readonly paneId: string | undefined
}

/** Whether this plugin may close a tab, as the host itself would decide. */
export type ClosableTab = (tab: OrderedTab) => boolean

/** What each of the three menu actions would close, in strip order. */
export interface CloseSets {
  /** Every closable docked tab but the target. */
  readonly others: readonly OrderedTab[]
  /** The target pane's closable tabs standing before the target. */
  readonly left: readonly OrderedTab[]
  /** The target pane's closable tabs standing after the target. */
  readonly right: readonly OrderedTab[]
}

/**
 * Compute what each action closes.
 *
 * `others` spans the docked surface; `left` and `right` are the target's own
 * strip, because that is the only order the document carries. A tab the
 * predicate refuses is dropped from the set rather than ending it, so one
 * unclosable neighbour cannot make an action abandon the tabs beyond it.
 * @param order - the docked strip order, then any floating tabs.
 * @param targetId - the tab whose menu the action was chosen from.
 * @param canClose - whether the host would close a given tab.
 * @returns the three target sets, each in strip order.
 */
export function closeTargets(
  order: readonly OrderedTab[],
  targetId: TabId,
  canClose: ClosableTab,
): CloseSets {
  const docked = order.filter(tab => tab.host === 'dock')
  const target = docked.find(tab => tab.id === targetId)
  const others = docked.filter(tab => tab.id !== targetId && canClose(tab))
  if (target === undefined || target.paneId === undefined)
    return { others, left: [], right: [] }
  const strip = docked.filter(tab => tab.paneId === target.paneId)
  const at = strip.indexOf(target)
  return {
    others,
    left: strip.slice(0, at).filter(canClose),
    right: strip.slice(at + 1).filter(canClose),
  }
}

/**
 * The host's own closability rule, restated over a read order.
 *
 * `ui-sidebar-right` refuses exactly one tab: the guide standing as the only
 * tab of the only docked pane. Closing it is a silent no-op there, so an action
 * that named it would stop short of the tabs after it. A tab with no record is
 * also refused, because closing it cannot act.
 *
 * The refusal is only returned when it can be proved. A pane id is readable
 * exactly when that pane's strip is rendered, so an unreadable pane id means
 * the tab stands somewhere the document does not show. Whenever any other pane
 * is proven to exist, the guide cannot be the docked surface's only tab and is
 * closable. When nothing proves a second pane, the guide is left out: naming a
 * tab the host would refuse closes nothing and leaves the action half done.
 * @param order - every tab the host currently shows.
 * @returns the predicate {@link closeTargets} takes.
 */
export function hostClosable(order: readonly OrderedTab[]): ClosableTab {
  const docked = order.filter(tab => tab.host === 'dock')
  const readablePanes = new Set(docked.flatMap(tab => tab.paneId === undefined ? [] : [tab.paneId]))
  const unreadableDocked = docked.some(tab => tab.paneId === undefined)
  return (tab) => {
    if (tab.kind === undefined)
      return false
    if (tab.kind !== GUIDE_KIND)
      return true
    if (tab.host !== 'dock')
      return true
    // A tab in a rendered strip proves a second pane exists, whether the guide
    // has a readable position of its own or not.
    if (tab.paneId !== undefined) {
      if (readablePanes.size > 1)
        return true
      if (unreadableDocked)
        return true
      return docked.filter(other => other.paneId === tab.paneId).length > 1
    }
    return readablePanes.size > 0
  }
}
