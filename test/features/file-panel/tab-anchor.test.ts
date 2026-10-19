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
import { DOCKKIT_ANCHORS, SIDEBAR_RIGHT_ANCHORS, TEXT_PREVIEW_ANCHORS } from '../../../src/client/dom/host-anchors.ts'
import {
  dockContentSelector,
  findTabBody,
  sidebarTabSelector,
} from '../../../src/client/features/file-panel/tab-anchor.ts'
import { createFakeDom } from '../../helpers/dom.ts'

describe('selectors', () => {
  it('names the tab by its id, on the anchors the host writes itself', () => {
    // 期望值这里手写选择器文本、只把属性名取自锚点常量：两个被测函数内部正是
    // 调用 `attributeSelector`，若期望值也用它生成，断言就退化成拿被测代码比它
    // 自己，方括号、引号这些拼装契约再也测不出来。
    expect(dockContentSelector('t-1')).toBe(`[${DOCKKIT_ANCHORS.content.name}="t-1"]`)
    expect(sidebarTabSelector('t-1')).toBe(`[${SIDEBAR_RIGHT_ANCHORS.tab.name}="t-1"]`)
  })

  it('escapes a quote so an exotic id cannot break out of the attribute value', () => {
    // The panel's selectors go through the plugin's one escaping point
    // (`dom/selector.ts`), which emits the CSS hex escape rather than a
    // backslash-quote: both keep the value inside the quotes, and only one of
    // them has to be re-derived here.
    // 同上：转义文本就是这条断言的载荷，必须手写，否则转义坏掉也照样绿。
    expect(sidebarTabSelector('a"b')).toBe(`[${SIDEBAR_RIGHT_ANCHORS.tab.name}="a\\22 b"]`)
    expect(dockContentSelector('a\\b')).toBe(`[${DOCKKIT_ANCHORS.content.name}="a\\5c b"]`)
  })
})

describe('findTabBody', () => {
  /** A document holding one tab's section and wrapper, the way the shell builds them. */
  function shell(tabId: string) {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute(DOCKKIT_ANCHORS.content.name, tabId)
    const wrapper = dom.document.createElement('div')
    wrapper.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
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
    section.setAttribute(DOCKKIT_ANCHORS.content.name, tabId)
    const header = dom.document.createElement('div')
    const strip = dom.document.createElement('div')
    // `data-dockkit-strip` 是上游真实存在的旁支标记（`ui-dockkit` 的测量代码读它），
    // 但本插件一个地方都不读，所以 `host-anchors.ts` 没有为它立常量；这里只是复刻
    // 一份真实结构的噪音，留着字面量，别为它新增锚点。
    // eslint-disable-next-line no-restricted-syntax -- 上游真实存在、本插件从不读取的布景属性
    strip.setAttribute('data-dockkit-strip', 'pane-1')
    const stripTabs = dom.document.createElement('div')
    stripTabs.setAttribute(DOCKKIT_ANCHORS.stripTabs.name, 'pane-1')
    const chip = dom.document.createElement('div')
    chip.setAttribute(DOCKKIT_ANCHORS.tab.name, tabId)
    const titleBox = dom.document.createElement('span')
    titleBox.setAttribute(DOCKKIT_ANCHORS.tabTitle.name, '')
    const title = dom.document.createElement('span')
    title.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
    // 复刻宿主真实标记里的噪音：本插件不读这个属性，`host-anchors.ts` 也就没有它，
    // 因此这里保留字面量（加进来只会得到一个没人读、却要跟着上游校验的常量）。
    // eslint-disable-next-line no-restricted-syntax -- 同上：不读它，故不立锚点常量
    title.setAttribute('data-sidebar-right-occurrence', `occ-${tabId}`)
    titleBox.appendChild(title)
    chip.appendChild(titleBox)
    stripTabs.appendChild(chip)
    strip.appendChild(stripTabs)
    header.appendChild(strip)
    const bodyHost = dom.document.createElement('div')
    const body = dom.document.createElement('div')
    body.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, tabId)
    // eslint-disable-next-line no-restricted-syntax -- 同上：不读它，故不立锚点常量
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
    preview.setAttribute(TEXT_PREVIEW_ANCHORS.state.name, state)
    // 同上：预览根的地址属性是实现细节的噪音，本插件从不读它，故保留字面量。
    // eslint-disable-next-line no-restricted-syntax -- 同上：预览地址属布景噪音，本插件不读
    preview.setAttribute('data-textpreview-url', `dsh-resource://file/session/s1/${tabId}.ts`)
    const toolbar = dom.document.createElement('div')
    const path = dom.document.createElement('span')
    path.setAttribute(TEXT_PREVIEW_ANCHORS.path.name, '')
    toolbar.appendChild(path)
    const content = dom.document.createElement('div')
    content.setAttribute(TEXT_PREVIEW_ANCHORS.body.name, '')
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
    section.setAttribute(DOCKKIT_ANCHORS.content.name, 't-1')
    const header = dom.document.createElement('header')
    header.setAttribute(DOCKKIT_ANCHORS.floatGrip.name, 'pane-1')
    const floatTitle = dom.document.createElement('div')
    floatTitle.setAttribute(DOCKKIT_ANCHORS.floatTitle.name, '')
    const titleBox = dom.document.createElement('span')
    titleBox.setAttribute(DOCKKIT_ANCHORS.tabTitle.name, '')
    const title = dom.document.createElement('span')
    title.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, 't-1')
    titleBox.appendChild(title)
    floatTitle.appendChild(titleBox)
    header.appendChild(floatTitle)
    const body = dom.document.createElement('div')
    body.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, 't-1')
    section.appendChild(header)
    section.appendChild(body)
    dom.document.body.appendChild(section)
    expect(findTabBody(dom.document, 't-1', 'page')).toBe(body)
  })

  it('takes the body when only one seat is rendered, whichever it is', () => {
    const dom = createFakeDom()
    const section = dom.document.createElement('section')
    section.setAttribute(DOCKKIT_ANCHORS.content.name, 't-1')
    const body = dom.document.createElement('div')
    body.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, 't-1')
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
    section.setAttribute(DOCKKIT_ANCHORS.content.name, 't-1')
    const strip = dom.document.createElement('div')
    strip.setAttribute(DOCKKIT_ANCHORS.stripTabs.name, 'pane-1')
    const chip = dom.document.createElement('div')
    chip.setAttribute(DOCKKIT_ANCHORS.tab.name, 't-1')
    const title = dom.document.createElement('span')
    title.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, 't-1')
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
    section.setAttribute(DOCKKIT_ANCHORS.content.name, 't-1')
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
    other.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, 't-10')
    dom.document.body.appendChild(other)
    expect(findTabBody(dom.document, 't-1', 'page')?.getAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name)).toBe('t-1')
  })
})
