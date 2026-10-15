/**
 * The kit's own anchors, and the one reading of "is this tab docked".
 *
 * Two features ask this question (the file panel about the tab it serves, the
 * tab actions about every open tab), so the reading now has one implementation
 * and these tests pin it once: the right attribute pair, the walk up to the
 * host, and the two ways a tab can fail to be there at all.
 *
 * @module @leiwang2000/dsh-tweaks/test/dom-dock-anchors
 */

import { describe, expect, it } from 'vitest'
import {
  DOCK_HOST,
  dockContentSelector,
  FLOAT_HOST,
  isDockedTab,
  SIDEBAR_SESSION,
  tabHostOf,
} from '../src/client/dom/dock-anchors.ts'
import { createFakeDom } from './helpers/dom.ts'

/** Build one tab's section inside a host element the kit drew it in. */
function tabIn(document: ReturnType<typeof createFakeDom>['document'], tabId: string, hostValue: string | undefined) {
  const host = document.createElement('div')
  if (hostValue !== undefined)
    host.setAttribute('data-dockkit-host', hostValue)
  const section = document.createElement('section')
  section.setAttribute('data-dockkit-content', tabId)
  host.appendChild(section)
  document.body.appendChild(host)
  return { host, section }
}

describe('the kit anchor names', () => {
  it('builds the section selector from the tab id, escaped through the one escaper', () => {
    expect(dockContentSelector('t-1')).toBe('[data-dockkit-content="t-1"]')
    expect(dockContentSelector('a"b')).toBe('[data-dockkit-content="a\\22 b"]')
  })

  it('names the session scope the tab actions read', () => {
    expect(SIDEBAR_SESSION).toBe('data-sidebar-right-session')
  })
})

describe('where a tab stands', () => {
  it('reads the two values the kit writes', () => {
    expect(tabHostOf(DOCK_HOST)).toBe(DOCK_HOST)
    expect(tabHostOf(FLOAT_HOST)).toBe(FLOAT_HOST)
  })

  it('answers docked for an absent value, so a caller always has an answer', () => {
    expect(tabHostOf(null)).toBe(DOCK_HOST)
  })
})

describe('isDockedTab', () => {
  it('answers true for a tab in a docked host', () => {
    const { document } = createFakeDom()
    tabIn(document, 't-1', DOCK_HOST)

    expect(isDockedTab(document, 't-1')).toBe(true)
  })

  it('answers false for a tab in a floating host', () => {
    const { document } = createFakeDom()
    tabIn(document, 't-1', FLOAT_HOST)

    expect(isDockedTab(document, 't-1')).toBe(false)
  })

  it('walks up to the host from the section rather than reading the section', () => {
    const { document } = createFakeDom()
    // The nesting is the point: the answer is on an ancestor, not the element
    // the tab id names.
    const { host } = tabIn(document, 't-1', FLOAT_HOST)
    const inner = document.createElement('div')
    host.appendChild(inner)

    expect(isDockedTab(document, 't-1')).toBe(false)
  })

  it('answers false for a tab the shell has not rendered', () => {
    const { document } = createFakeDom()

    expect(isDockedTab(document, 'missing')).toBe(false)
  })

  it('does not confuse a tab with one whose id starts the same way', () => {
    const { document } = createFakeDom()
    tabIn(document, 't-10', FLOAT_HOST)
    tabIn(document, 't-1', DOCK_HOST)

    expect(isDockedTab(document, 't-1')).toBe(true)
  })

  it('reads a host that shares the section element, with no wrapper above it', () => {
    const { document } = createFakeDom()
    const section = document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    section.setAttribute('data-dockkit-host', FLOAT_HOST)
    document.body.appendChild(section)

    expect(isDockedTab(document, 't-1')).toBe(false)
  })
})
