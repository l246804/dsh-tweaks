/**
 * Seam two for the tab actions: the one thing this feature reads from the DOM.
 *
 * A tab record carries no order, so the strip's own markup is the order source.
 * These tests build the anchors the docking kit publishes and assert what the
 * reader makes of them: which tabs exist, where each stands, and in what order.
 * They also assert the other half of the contract, that reading leaves the
 * document exactly as it was.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/tab-actions/order
 */

import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { ElementLike } from '../../../src/client/dom/types.ts'
import type { KindRecord } from '../../../src/client/features/tab-actions/order.ts'
import type { FakeDom } from '../../helpers/dom.ts'
import { describe, expect, it } from 'vitest'
import { combineOrder, readPlacements } from '../../../src/client/features/tab-actions/order.ts'
import { createFakeDom } from '../../helpers/dom.ts'

/** The stand-in document, whose extra read faces (`body`) the tests draw into. */
type StandIn = FakeDom['document']

/** The Session under test, and a background one that must stay out of the read. */
const SESSION = 's1'
const OTHER_SESSION = 's2'

/** One Session's panel container, the scope every read is bounded by. */
function panel(document: StandIn, sessionId: string): ElementLike {
  const container = document.createElement('div')
  container.setAttribute('data-sidebar-right-session', sessionId)
  document.body.appendChild(container)
  return container
}

/** Build one docked pane's strip: a chips container holding one chip per id. */
function strip(document: StandIn, into: ElementLike, paneId: string, tabIds: readonly string[]): ElementLike {
  const container = document.createElement('div')
  container.setAttribute('data-dockkit-strip-tabs', paneId)
  for (const id of tabIds) {
    const chip = document.createElement('div')
    chip.setAttribute('data-dockkit-tab', id)
    container.appendChild(chip)
  }
  into.appendChild(container)
  return container
}

/** Build one tab's permanent host section, docked or floating. */
function host(document: StandIn, into: ElementLike, tabId: string, floating: boolean, paneId: string): ElementLike {
  const section = document.createElement('section')
  section.setAttribute('data-dockkit-content', tabId)
  section.setAttribute('data-dockkit-host', floating ? 'float' : 'dock')
  section.setAttribute(floating ? 'data-dockkit-float' : 'data-dockkit-pane', paneId)
  into.appendChild(section)
  return section
}

/** A record as the sidebar reports it. */
function record(id: string, kind: string): KindRecord {
  return { id: id as TabId, kind }
}

describe('reading the strip', () => {
  it('reads one docked pane\'s chips in their display order', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['t1', 't2', 't3'])
    host(document, view, 't1', false, 'pane-1')
    host(document, view, 't2', false, 'pane-1')
    host(document, view, 't3', false, 'pane-1')

    expect(readPlacements(document, SESSION)).toEqual([
      { id: 't1', host: 'dock', paneId: 'pane-1' },
      { id: 't2', host: 'dock', paneId: 'pane-1' },
      { id: 't3', host: 'dock', paneId: 'pane-1' },
    ])
  })

  it('keeps a tab id verbatim, however it is spelled', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    const odd = 'a"b\\c:d/../e'
    strip(document, view, 'pane-1', [odd])
    host(document, view, odd, false, 'pane-1')

    expect(readPlacements(document, SESSION).map(entry => entry.id)).toEqual([odd])
  })

  it('reads nothing from a pane standing empty', () => {
    const { document } = createFakeDom()
    panel(document, SESSION)

    expect(readPlacements(document, SESSION)).toEqual([])
  })

  it('attributes each pane\'s chips to its own pane when two are docked', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['a', 'b'])
    strip(document, view, 'pane-2', ['x'])
    for (const [id, paneId] of [['a', 'pane-1'], ['b', 'pane-1'], ['x', 'pane-2']] as const)
      host(document, view, id, false, paneId)

    expect(readPlacements(document, SESSION)).toEqual([
      { id: 'a', host: 'dock', paneId: 'pane-1' },
      { id: 'b', host: 'dock', paneId: 'pane-1' },
      { id: 'x', host: 'dock', paneId: 'pane-2' },
    ])
  })

  it('ignores a caret between chips, and any other sibling of one', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    const container = document.createElement('div')
    container.setAttribute('data-dockkit-strip-tabs', 'pane-1')
    const chipA = document.createElement('div')
    chipA.setAttribute('data-dockkit-tab', 'a')
    const caret = document.createElement('div')
    caret.setAttribute('data-dockkit-caret', '1')
    const chipB = document.createElement('div')
    chipB.setAttribute('data-dockkit-tab', 'b')
    container.appendChild(chipA)
    container.appendChild(caret)
    container.appendChild(chipB)
    view.appendChild(container)
    host(document, view, 'a', false, 'pane-1')
    host(document, view, 'b', false, 'pane-1')

    expect(readPlacements(document, SESSION).map(entry => entry.id)).toEqual(['a', 'b'])
  })

  it('reports a floating tab as floating, with the pane that draws it', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['t1'])
    host(document, view, 't1', false, 'pane-1')
    host(document, view, 'ft', true, 'float-1')

    expect(readPlacements(document, SESSION)).toEqual([
      { id: 't1', host: 'dock', paneId: 'pane-1' },
      { id: 'ft', host: 'float', paneId: 'float-1' },
    ])
  })

  it('reports a docked tab whose pane strip is not rendered as docked with no position', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['active'])
    host(document, view, 'active', false, 'pane-1')
    // A second docked pane exists, but only the active pane's strip is drawn.
    host(document, view, 'elsewhere', false, 'pane-2')

    expect(readPlacements(document, SESSION)).toEqual([
      { id: 'active', host: 'dock', paneId: 'pane-1' },
      { id: 'elsewhere', host: 'dock', paneId: undefined },
    ])
  })

  it('never counts a floating tab as a docked one, whatever the document order', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    host(document, view, 'ft', true, 'float-1')
    strip(document, view, 'pane-1', ['t1'])
    host(document, view, 't1', false, 'pane-1')

    expect(readPlacements(document, SESSION)).toEqual([
      { id: 't1', host: 'dock', paneId: 'pane-1' },
      { id: 'ft', host: 'float', paneId: 'float-1' },
    ])
  })

  it('reads only the Session it was asked about', () => {
    const { document } = createFakeDom()
    const mine = panel(document, SESSION)
    const theirs = panel(document, OTHER_SESSION)
    strip(document, mine, 'pane-1', ['mine'])
    host(document, mine, 'mine', false, 'pane-1')
    strip(document, theirs, 'pane-9', ['theirs'])
    host(document, theirs, 'theirs', false, 'pane-9')

    expect(readPlacements(document, SESSION).map(entry => entry.id)).toEqual(['mine'])
    expect(readPlacements(document, OTHER_SESSION).map(entry => entry.id)).toEqual(['theirs'])
  })

  it('reads nothing from a Session with no panel open', () => {
    const { document } = createFakeDom()
    const theirs = panel(document, OTHER_SESSION)
    strip(document, theirs, 'pane-9', ['theirs'])

    expect(readPlacements(document, SESSION)).toEqual([])
  })

  it('leaves the document untouched', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['t1'])
    host(document, view, 't1', false, 'pane-1')
    host(document, view, 'ft', true, 'float-1')
    const snapshot = (): string[] => document.body.descendants()
      .map(element => `${element.tagName}:${JSON.stringify(Object.entries(element.dataset))}`)

    const before = snapshot()
    readPlacements(document, SESSION)

    expect(snapshot()).toEqual(before)
    expect(document.listenerCount()).toBe(0)
  })
})

describe('joining order to records', () => {
  it('gives each placement its record\'s kind, keeping display order', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['t1', 't2'])
    host(document, view, 't1', false, 'pane-1')
    host(document, view, 't2', false, 'pane-1')

    const order = combineOrder(readPlacements(document, SESSION), [record('t2', 'text'), record('t1', 'guide')])

    expect(order.map(entry => [entry.id, entry.kind])).toEqual([['t1', 'guide'], ['t2', 'text']])
  })

  it('keeps a record the markup did not place, as docked with no position', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['t1'])
    host(document, view, 't1', false, 'pane-1')

    const order = combineOrder(readPlacements(document, SESSION), [record('t1', 'text'), record('unseen', 'text')])

    expect(order).toEqual([
      { id: 't1', kind: 'text', host: 'dock', paneId: 'pane-1' },
      { id: 'unseen', kind: 'text', host: 'dock', paneId: undefined },
    ])
  })

  it('leaves a placed tab with no record kindless, so the host refuses it', () => {
    const { document } = createFakeDom()
    const view = panel(document, SESSION)
    strip(document, view, 'pane-1', ['ghost'])
    host(document, view, 'ghost', false, 'pane-1')

    const order = combineOrder(readPlacements(document, SESSION), [])

    expect(order).toEqual([{ id: 'ghost', kind: undefined, host: 'dock', paneId: 'pane-1' }])
  })
})
