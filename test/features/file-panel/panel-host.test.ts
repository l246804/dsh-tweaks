/**
 * The panel's DOM face, against the plugin's own DOM stand-in.
 *
 * The point of these tests is the property the whole design rests on: the
 * container is *moved* between tab bodies, never rebuilt. Node identity is how
 * that is checked, and it is also how "a tab switch cannot produce a second
 * tree, a second set of subscriptions, or a lost expansion state" becomes a
 * statement with evidence behind it.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/panel-host
 */

import { describe, expect, it } from 'vitest'
import { SIDEBAR_RIGHT_ANCHORS } from '../../../src/client/dom/host-anchors.ts'
import { createPanelHost, PANEL_CONTAINER_ATTRIBUTE, PANEL_HOST_ATTRIBUTE } from '../../../src/client/features/file-panel/panel-host.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { fakeHostDom } from './fake-host-dom.ts'

/** One fake tab body per id, the way the shell renders them. */
function tabBodies() {
  const dom = createFakeDom()
  const body = (id: string) => {
    const element = dom.document.createElement('div')
    element.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, id)
    return element
  }
  return { dom, body }
}

describe('createPanelHost', () => {
  it('creates its container once and answers with the same node every time', () => {
    const { dom } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    expect(host.container()).toBe(host.container())
    expect(host.container().getAttribute(PANEL_CONTAINER_ATTRIBUTE)).toBe('')
  })

  it('docks into the given tab body and marks how it sits there', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    expect(host.attach(first, 'dock')).toBe(true)
    expect(host.location()).toEqual({ host: first, mode: 'dock' })
    expect(first.getAttribute(PANEL_HOST_ATTRIBUTE)).toBe('dock')
    expect([...first.children]).toEqual([host.container()])
  })

  it('moves the same node when the tab changes, leaving no mark on the old host', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    const second = body('b')
    host.attach(first, 'dock')
    const container = host.container()

    expect(host.attach(second, 'dock')).toBe(true)
    expect(host.container()).toBe(container)
    expect([...second.children]).toEqual([container])
    expect([...first.children]).toEqual([])
    expect(first.getAttribute(PANEL_HOST_ATTRIBUTE)).toBeNull()
    expect(second.getAttribute(PANEL_HOST_ATTRIBUTE)).toBe('dock')
  })

  it('does not rebuild what it already has: a redundant attach moves nothing and reports it', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    host.attach(first, 'dock')
    const container = host.container()
    expect(host.attach(first, 'dock')).toBe(false)
    expect(host.container()).toBe(container)
    expect([...first.children]).toEqual([container])
  })

  it('re-marks the host when only the mode changes', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    host.attach(first, 'page')
    expect(host.attach(first, 'dock')).toBe(true)
    expect(first.getAttribute(PANEL_HOST_ATTRIBUTE)).toBe('dock')
    expect([...first.children]).toEqual([host.container()])
  })

  it('takes the container off the page without destroying it', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    host.attach(first, 'dock')
    const container = host.container()

    host.detach()
    expect(host.location()).toBeUndefined()
    expect(first.getAttribute(PANEL_HOST_ATTRIBUTE)).toBeNull()
    expect([...first.children]).toEqual([])
    // Off the DOM, but the same node with its state intact, which is what makes
    // the next attach cheap and lossless.
    expect(host.container()).toBe(container)
    host.attach(body('b'), 'dock')
    expect(host.container()).toBe(container)
  })

  it('leaves no marker and no container behind on dispose', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    host.attach(first, 'dock')
    const container = host.container()

    host.dispose()
    expect(host.location()).toBeUndefined()
    expect(first.getAttribute(PANEL_HOST_ATTRIBUTE)).toBeNull()
    expect([...first.children]).toEqual([])
    expect(container.parentNode).toBeUndefined()
  })

  it('keeps the host element the shell rendered otherwise untouched', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    const first = body('a')
    const other = dom.document.createElement('p')
    first.appendChild(other)

    host.attach(first, 'dock')
    host.dispose()
    // The host's own child that the shell put there survives untouched.
    expect(first.getAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name)).toBe('a')
    expect([...first.children]).toEqual([other])
  })

  it('is safe to detach and dispose twice', () => {
    const { dom, body } = tabBodies()
    const host = createPanelHost(fakeHostDom(dom))
    host.attach(body('a'), 'dock')
    host.detach()
    host.detach()
    host.dispose()
    host.dispose()
    expect(host.location()).toBeUndefined()
  })
})
