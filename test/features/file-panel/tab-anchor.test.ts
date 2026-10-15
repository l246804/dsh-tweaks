/**
 * Finding the tab the panel should dock into, by the host's stable anchors.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/tab-anchor
 */

import { describe, expect, it } from 'vitest'
import {
  dockContentSelector,
  findTabBody,
  sidebarTabSelector,
} from '../../../src/client/features/file-panel/tab-anchor.ts'
import { createFakeDom } from '../../helpers/dom.ts'

describe('selectors', () => {
  it('names the tab by its id, on the anchors the host writes itself', () => {
    expect(dockContentSelector('t-1')).toBe('[data-dockkit-content="t-1"]')
    expect(sidebarTabSelector('t-1')).toBe('[data-sidebar-right-tab="t-1"]')
  })

  it('escapes a quote so an exotic id cannot break out of the attribute value', () => {
    expect(sidebarTabSelector('a"b')).toBe('[data-sidebar-right-tab="a\\"b"]')
  })
})

describe('findTabBody', () => {
  /** A document holding one tab's section and wrapper, the way the shell builds them. */
  function shell(tabId: string) {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', tabId)
    const wrapper = dom.document.createElement('div')
    wrapper.setAttribute('data-sidebar-right-tab', tabId)
    section.appendChild(wrapper)
    dom.document.body.appendChild(section)
    return { dom, section, wrapper }
  }

  it('prefers the sidebar wrapper, because that is where the tab content lives', () => {
    const { dom, wrapper } = shell('t-1')
    expect(findTabBody(dom.document, 't-1')).toBe(wrapper)
  })

  it('falls back to the docking kit section when the wrapper is not rendered', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1')).toBe(section)
  })

  it('finds nothing for a tab that is not rendered', () => {
    const { dom } = shell('t-1')
    expect(findTabBody(dom.document, 'missing')).toBeUndefined()
  })

  it('does not confuse one tab id with another that starts the same way', () => {
    const { dom } = shell('t-1')
    const other = dom.document.createElement('div')
    other.setAttribute('data-sidebar-right-tab', 't-10')
    dom.document.body.appendChild(other)
    expect(findTabBody(dom.document, 't-1')?.getAttribute('data-sidebar-right-tab')).toBe('t-1')
  })
})
