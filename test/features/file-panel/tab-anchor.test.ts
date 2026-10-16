/**
 * Finding the tab the panel should dock into, by the host's stable anchors.
 *
 * Two questions, tested apart because they have different answers. **Which tab**
 * is one: the kit's per-tab `<section>`, named by the tab id, and undefined when
 * the tab is not rendered. **Which element inside that tab** depends on how the
 * panel sits there: a docked panel hangs off the preview's own root, while a page
 * panel uses the sidebar's body seat.
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
    // The panel's selectors go through the plugin's one escaping point
    // (`dom/selector.ts`), which emits the CSS hex escape rather than a
    // backslash-quote: both keep the value inside the quotes, and only one of
    // them has to be re-derived here.
    expect(sidebarTabSelector('a"b')).toBe('[data-sidebar-right-tab="a\\22 b"]')
    expect(dockContentSelector('a\\b')).toBe('[data-dockkit-content="a\\5c b"]')
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

  /**
   * A file tab as the preview plugin renders it: the kit's section, the sidebar's
   * title and body seats, and inside the body the preview's own root.
   *
   * The preview root is where the toolbar row, the content and (once docked) the
   * panel all live, so it is the element a dock has to land in.
   * @param dom - the stand-in to build in.
   * @param tabId - the tab record's id.
   * @param state - the preview's state value, one of `text` / `unsupported` / `loading`.
   * @returns the elements a test may want to name.
   */
  function previewTab(dom: ReturnType<typeof createFakeDom>, tabId: string, state = 'text') {
    const { section, title, body } = realTab(dom, tabId)
    const preview = dom.document.createElement('div')
    preview.setAttribute('data-textpreview-state', state)
    preview.setAttribute('data-textpreview-url', `dsh-resource://file/session/s1/${tabId}.ts`)
    const toolbar = dom.document.createElement('div')
    const path = dom.document.createElement('span')
    path.setAttribute('data-textpreview-path', '')
    toolbar.appendChild(path)
    const content = dom.document.createElement('div')
    content.setAttribute('data-textpreview-body', '')
    preview.appendChild(toolbar)
    preview.appendChild(content)
    body.appendChild(preview)
    return { section, title, body, preview, toolbar, content }
  }

  it('takes the whole tab body for the file-list page, where this plugin renders it', () => {
    const { dom, wrapper } = shell('t-1')
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(wrapper)
  })

  it('takes the body, not the chip title, when both carry the tab attribute', () => {
    // The panel's whole docking promise rests on this: the title seat is inside
    // the chip and precedes the body, so the naive lookup appends the panel into
    // the tab's own label.
    const dom = createFakeDom()
    const { title, body } = realTab(dom, 't-1')
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(body)
    expect(findTabBody(dom.document, 't-1', 'page')).not.toBe(title)
  })

  it('takes the preview root for a file tab, so the panel lands beside the file', () => {
    // Not the sidebar's body seat: that wrapper holds the preview's toolbar as
    // well, so docking there would put the panel beside the toolbar row instead
    // of under it.
    const dom = createFakeDom()
    const { preview, body } = previewTab(dom, 't-1')
    expect(findTabBody(dom.document, 't-1', 'dock')).toBe(preview)
    expect(findTabBody(dom.document, 't-1', 'dock')).not.toBe(body)
  })

  it('takes the preview root in every state the preview renders, so a dock does not need a readable file', () => {
    for (const state of ['text', 'unsupported', 'loading']) {
      const dom = createFakeDom()
      const { preview } = previewTab(dom, 't-1', state)
      expect(findTabBody(dom.document, 't-1', 'dock')).toBe(preview)
    }
  })

  it('finds this tab\'s preview, not another tab\'s, when several bodies are mounted', () => {
    // The kit keeps a visited tab's body mounted, so an unscoped search for the
    // preview root would dock the panel into whichever tab rendered first.
    const dom = createFakeDom()
    const first = previewTab(dom, 't-1')
    const second = previewTab(dom, 't-2')
    expect(findTabBody(dom.document, 't-2', 'dock')).toBe(second.preview)
    expect(findTabBody(dom.document, 't-2', 'dock')).not.toBe(first.preview)
    expect(findTabBody(dom.document, 't-1', 'dock')).toBe(first.preview)
  })

  it('falls back to the sidebar body seat for a file tab the preview has not rendered into yet', () => {
    // A non-text resource, or a preview still mounting: there is no preview root
    // to dock into, and the sidebar's own body seat is the honest answer. It is
    // better than the pane-level section, which would leave the panel spanning
    // whatever the tab's header sits above.
    const dom = createFakeDom()
    const { body } = realTab(dom, 't-1')
    expect(findTabBody(dom.document, 't-1', 'dock')).toBe(body)
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
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(body)
  })

  it('takes the body when only one seat is rendered, whichever it is', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    const body = dom.document.createElement('div')
    body.setAttribute('data-sidebar-right-tab', 't-1')
    section.appendChild(body)
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(body)
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

    expect(findTabBody(dom.document, 't-1', 'page')).toBe(section)
    expect(findTabBody(dom.document, 't-1', 'dock')).toBe(section)
  })

  it('falls back to the docking kit section when the wrapper is not rendered', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute('data-dockkit-content', 't-1')
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(section)
    expect(findTabBody(dom.document, 't-1', 'dock')).toBe(section)
  })

  it('finds nothing for a tab that is not rendered', () => {
    const { dom } = shell('t-1')
    expect(findTabBody(dom.document, 'missing', 'page')).toBeUndefined()
    expect(findTabBody(dom.document, 'missing', 'dock')).toBeUndefined()
  })

  it('does not confuse one tab id with another that starts the same way', () => {
    const { dom } = shell('t-1')
    const other = dom.document.createElement('div')
    other.setAttribute('data-sidebar-right-tab', 't-10')
    dom.document.body.appendChild(other)
    expect(findTabBody(dom.document, 't-1', 'page')?.getAttribute('data-sidebar-right-tab')).toBe('t-1')
  })
})
