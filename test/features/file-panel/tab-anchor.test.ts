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

  /**
   * One tab rendered the way the shell really renders it: the kit's per-tab
   * `<section>`, then a header holding the strip's chip, with the sidebar's
   * title seat *inside that chip*, and only then the body, which the sidebar
   * tags with the very same attribute.
   *
   * The two agreeing attributes are the whole difficulty: the sidebar writes
   * `data-sidebar-right-tab` on both seats, and the title comes first in
   * document order, so a plain `querySelector` finds the chip's label.
   * @param dom - the stand-in to build in.
   * @param tabId - the tab record's id.
   * @returns every element of the structure a test may want to name.
   */
  function realTab(dom: ReturnType<typeof createFakeDom>, tabId: string) {
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', tabId)
    const header = dom.document.createElement('div')
    const strip = dom.document.createElement('div')
    strip.setAttribute('data-dockkit-strip', 'pane-1')
    const stripTabs = dom.document.createElement('div')
    stripTabs.setAttribute('data-dockkit-strip-tabs', 'pane-1')
    const chip = dom.document.createElement('div')
    chip.setAttribute('data-dockkit-tab', tabId)
    const titleBox = dom.document.createElement('span')
    titleBox.setAttribute('data-dockkit-tab-title', '')
    const title = dom.document.createElement('span')
    title.setAttribute('data-sidebar-right-tab', tabId)
    title.setAttribute('data-sidebar-right-occurrence', `occ-${tabId}`)
    titleBox.appendChild(title)
    chip.appendChild(titleBox)
    stripTabs.appendChild(chip)
    strip.appendChild(stripTabs)
    header.appendChild(strip)
    const bodyHost = dom.document.createElement('div')
    const body = dom.document.createElement('div')
    body.setAttribute('data-sidebar-right-tab', tabId)
    body.setAttribute('data-sidebar-right-occurrence', `occ-${tabId}`)
    bodyHost.appendChild(body)
    section.appendChild(header)
    section.appendChild(bodyHost)
    dom.document.body.appendChild(section)
    return { section, header, chip, title, body }
  }

  it('prefers the sidebar wrapper, because that is where the tab content lives', () => {
    const { dom, wrapper } = shell('t-1')
    expect(findTabBody(dom.document, 't-1')).toBe(wrapper)
  })

  it('takes the body, not the chip title, when both carry the tab attribute', () => {
    // The panel's whole docking promise rests on this: the title seat is inside
    // the chip and precedes the body, so the naive lookup appends the panel into
    // the tab's own label.
    const dom = createFakeDom()
    const { title, body } = realTab(dom, 't-1')
    expect(findTabBody(dom.document, 't-1')).toBe(body)
    expect(findTabBody(dom.document, 't-1')).not.toBe(title)
  })

  it('takes the body of a floating pane, whose title hangs off a float header', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    const header = dom.document.createElement('header')
    header.setAttribute('data-dockkit-float-grip', 'pane-1')
    const floatTitle = dom.document.createElement('div')
    floatTitle.setAttribute('data-dockkit-float-title', '')
    const titleBox = dom.document.createElement('span')
    titleBox.setAttribute('data-dockkit-tab-title', '')
    const title = dom.document.createElement('span')
    title.setAttribute('data-sidebar-right-tab', 't-1')
    titleBox.appendChild(title)
    floatTitle.appendChild(titleBox)
    header.appendChild(floatTitle)
    const body = dom.document.createElement('div')
    body.setAttribute('data-sidebar-right-tab', 't-1')
    section.appendChild(header)
    section.appendChild(body)
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1')).toBe(body)
  })

  it('takes the body when only one seat is rendered, whichever it is', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    const body = dom.document.createElement('div')
    body.setAttribute('data-sidebar-right-tab', 't-1')
    section.appendChild(body)
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1')).toBe(body)
  })

  it('refuses a title seat even when its own title box is gone, falling back to the section', () => {
    // The chip and the strip are the outer chrome, and they survive a rename of
    // the inner title box. A title-only tab therefore resolves to the pane-level
    // section rather than into the label.
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    const strip = dom.document.createElement('div')
    strip.setAttribute('data-dockkit-strip-tabs', 'pane-1')
    const chip = dom.document.createElement('div')
    chip.setAttribute('data-dockkit-tab', 't-1')
    const title = dom.document.createElement('span')
    title.setAttribute('data-sidebar-right-tab', 't-1')
    chip.appendChild(title)
    strip.appendChild(chip)
    section.appendChild(strip)
    dom.document.body.appendChild(section)

    expect(findTabBody(dom.document, 't-1')).toBe(section)
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
