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
import { DOCKKIT_ANCHORS } from '../src/client/dom/host-anchors.ts'
import { createFakeDom } from './helpers/dom.ts'

/** Build one tab's section inside a host element the kit drew it in. */
function tabIn(document: ReturnType<typeof createFakeDom>['document'], tabId: string, hostValue: string | undefined) {
  const host = document.createElement('div')
  if (hostValue !== undefined)
    host.setAttribute(DOCKKIT_ANCHORS.host.name, hostValue)
  const section = document.createElement('section')
  section.setAttribute(DOCKKIT_ANCHORS.content.name, tabId)
  host.appendChild(section)
  document.body.appendChild(host)
  return { host, section }
}

describe('the kit anchor names', () => {
  it('builds the section selector from the tab id, escaped through the one escaper', () => {
    // 期望值手写选择器文本、只把属性名取自锚点常量：`dockContentSelector` 内部就是
    // `attributeSelector`，期望值若也由它生成，这条断言对拼装契约就恒真了。
    expect(dockContentSelector('t-1')).toBe(`[${DOCKKIT_ANCHORS.content.name}="t-1"]`)
    expect(dockContentSelector('a"b')).toBe(`[${DOCKKIT_ANCHORS.content.name}="a\\22 b"]`)
  })

  it('names the session scope the tab actions read', () => {
    // 这里断言的是锚点模块自身对外承诺的那一个字符串，字面量正是被守护的契约本身，
    // 所以它必须留在这里：换成常量取值就成了自己和自己比，这条断言也就不再有内容。
    // eslint-disable-next-line no-restricted-syntax -- 断言的正是锚点模块承诺的字符串本身
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
    section.setAttribute(DOCKKIT_ANCHORS.content.name, 't-1')
    section.setAttribute(DOCKKIT_ANCHORS.host.name, FLOAT_HOST)
    document.body.appendChild(section)

    expect(isDockedTab(document, 't-1')).toBe(false)
  })
})
