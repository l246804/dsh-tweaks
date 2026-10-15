/**
 * The strip order, read from the anchors the docking kit publishes.
 *
 * A tab record carries identity, kind, content address and title, and no order.
 * The one place the order exists is the docking kit's own markup, which it
 * maintains for its drag gestures: a strip's chips container
 * (`[data-dockkit-strip-tabs]`) holds one chip per tab in display order
 * (`[data-dockkit-tab]` = tab id), and every tab has a permanent host section
 * (`[data-dockkit-content]` = tab id) that also states whether it is docked or
 * floating. Those three attributes are a contract the kit keeps for itself, so
 * reading them is reading a stable surface rather than reverse-engineering one.
 *
 * Two consequences of that markup decide the shape of this module:
 *
 * - Only the active pane's strip is rendered, so a pane's chip order exists
 *   exactly while that pane is active. A tab in another pane is still visible
 *   through its host section, but its position is unknowable, so a placement
 *   carries a pane id only when the strip could name one.
 * - Several Sessions' sidebars can be in the document at once (a retained
 *   background Session stays mounted), so every read is scoped to the Session
 *   whose panel the action belongs to.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/tab-actions/order
 */

import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { OrderedTab, TabHost } from './targets.ts'
import { attributeSelector } from '../../dom/selector.ts'

/** The attributes the reading depends on, named once. */
const SESSION = 'data-sidebar-right-session'
const STRIP_TABS = 'data-dockkit-strip-tabs'
const CHIP = 'data-dockkit-tab'
const CONTENT = 'data-dockkit-content'
const HOST = 'data-dockkit-host'
const FLOAT = 'data-dockkit-float'

/**
 * The narrowest element surface this reader needs.
 *
 * It asks an element for attributes and for its matching descendants, nothing
 * more. The browser's own `Element` satisfies it structurally, and so does this
 * project's test stand-in, so the production read and the tested read are one
 * implementation.
 */
interface ReadableElement {
  /**
   * Read one attribute.
   * @param name - the attribute name.
   * @returns the value, or null when absent.
   */
  getAttribute: (name: string) => string | null
  /**
   * Find every matching descendant.
   * @param selector - a CSS selector.
   * @returns the matches, in document order.
   */
  querySelectorAll: (selector: string) => Iterable<ReadableElement>
}

/** The document surface this reader needs. */
export interface ReadableRoot {
  /**
   * Find every matching element.
   * @param selector - a CSS selector.
   * @returns the matches, in document order.
   */
  querySelectorAll: (selector: string) => Iterable<ReadableElement>
}

/** Where one tab stands, as far as the document says. */
export interface TabPlacement {
  /** The tab id the kit wrote into the anchor. */
  readonly id: TabId
  /** Whether the tab is docked or floating. */
  readonly host: TabHost
  /** The pane holding the tab, present for a floating tab and for a docked tab whose strip is rendered. */
  readonly paneId: string | undefined
}

/** The minimum a record must carry here: identity and kind. */
export interface KindRecord {
  /** The record's id, as the host reports it. */
  readonly id: string
  /** The record's kind. */
  readonly kind: string
}

/** The `host` value the kit writes on a floating tab's section. */
const FLOAT_HOST: TabHost = 'float'

/** One tab host section, as the kit writes it. */
interface SectionEntry {
  readonly id: string
  readonly host: TabHost
  /** The floating pane that draws the tab; a docked tab's pane comes from its strip. */
  readonly floatPaneId: string | undefined
}

/**
 * Read every tab host section of one Session, in document order.
 *
 * The section is the one anchor that exists for every tab whether or not it is
 * selected, so it is the completeness source: a strip can be absent, a section
 * cannot.
 * @param root - the document to read.
 * @param scope - the Session's own selector prefix.
 * @returns one entry per section.
 */
function sectionEntries(root: ReadableRoot, scope: string): readonly SectionEntry[] {
  const entries: SectionEntry[] = []
  for (const section of root.querySelectorAll(`${scope} ${attributeSelector(CONTENT)}`)) {
    const id = section.getAttribute(CONTENT)
    if (id === null)
      continue
    const floating = section.getAttribute(HOST) === FLOAT_HOST
    entries.push({ id, host: floating ? FLOAT_HOST : 'dock', floatPaneId: section.getAttribute(FLOAT) ?? undefined })
  }
  return entries
}

/**
 * Read the docked tabs a rendered strip names, in display order.
 *
 * Only the active pane's strip is in the document, so this is the sole source
 * of a docked position; a tab it does not name has none.
 * @param root - the document to read.
 * @param scope - the Session's own selector prefix.
 * @returns the placements the strips name, each on its own pane.
 */
function stripPlacements(root: ReadableRoot, scope: string): readonly TabPlacement[] {
  const placements: TabPlacement[] = []
  for (const strip of root.querySelectorAll(`${scope} ${attributeSelector(STRIP_TABS)}`)) {
    const paneId = strip.getAttribute(STRIP_TABS) ?? undefined
    for (const chip of strip.querySelectorAll(attributeSelector(CHIP))) {
      const id = chip.getAttribute(CHIP)
      if (id !== null)
        placements.push({ id: id as TabId, host: 'dock', paneId })
    }
  }
  return placements
}

/**
 * Read every tab of one Session and what the markup says about each.
 *
 * Docked tabs come out in strip order, in the order the strips stand in the
 * document; docked tabs whose pane strip is not rendered follow, then the
 * floating tabs in document order. That is a total order, so `others` has a
 * deterministic sequence, while only the docked run carries the positions the
 * sides need.
 * @param root - the document to read.
 * @param sessionId - the Session whose panel is read, so a retained
 *   background Session cannot contribute its tabs.
 * @returns one placement per tab, or an empty list when no panel is drawn.
 */
export function readPlacements(root: ReadableRoot, sessionId: string): readonly TabPlacement[] {
  const scope = attributeSelector(SESSION, sessionId)
  const sections = sectionEntries(root, scope)
  const docked = new Set(sections.filter(section => section.host === 'dock').map(section => section.id))
  const placements: TabPlacement[] = []
  const placed = new Set<string>()
  // A floating tab has no strip position at all, so a strip naming one is not
  // treated as a docked placement.
  for (const placement of stripPlacements(root, scope)) {
    const id = placement.id as string
    if (!docked.has(id) || placed.has(id))
      continue
    placed.add(id)
    placements.push(placement)
  }
  for (const host of ['dock', FLOAT_HOST] as const) {
    for (const section of sections) {
      if (section.host !== host || placed.has(section.id))
        continue
      placed.add(section.id)
      placements.push({
        id: section.id as TabId,
        host: section.host,
        // A docked tab whose strip is not rendered has no readable position.
        paneId: host === FLOAT_HOST ? section.floatPaneId : undefined,
      })
    }
  }
  return placements
}

/**
 * Attach each tab's kind to its placement, and account for tabs the markup did
 * not show.
 *
 * The kind is the one thing the document cannot state and the records can, so
 * the two are joined by id. A record with no placement is still an open tab; it
 * is reported as docked with no position, which keeps it in "others" without
 * pretending to know where it stood. A tab with no record gets no kind, which
 * the host's closability rule refuses; closing it could not act anyway.
 * @param placements - the document read, in display order.
 * @param records - the Session's open tab records.
 * @returns the ordered tabs the close sets are computed from.
 */
export function combineOrder(
  placements: readonly TabPlacement[],
  records: readonly KindRecord[],
): readonly OrderedTab[] {
  const kindOf = new Map(records.map(record => [record.id, record.kind]))
  const ordered: OrderedTab[] = placements.map(placement => ({
    id: placement.id,
    kind: kindOf.get(placement.id),
    host: placement.host,
    paneId: placement.paneId,
  }))
  const seen = new Set(placements.map(placement => placement.id as string))
  for (const record of records) {
    if (seen.has(record.id))
      continue
    ordered.push({ id: record.id as TabId, kind: record.kind, host: 'dock', paneId: undefined })
  }
  return ordered
}
