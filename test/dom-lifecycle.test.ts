/**
 * Seam two: the DOM adapter layer, against this plugin's own DOM stand-in.
 *
 * These tests read and write the anchors the plugin depends on and then assert
 * the property that matters most for a plugin which patches the host's page: an
 * uninstall leaves nothing behind.
 *
 * @module @leiwang2000/dsh-tweaks/test/dom-lifecycle
 */

import { describe, expect, it } from 'vitest'
import { installListener } from '../src/client/dom/listeners.ts'
import { STYLE_ELEMENT_MARKER } from '../src/client/dom/markers.ts'
import { installStyles } from '../src/client/dom/styles.ts'
import { createFakeDom } from './helpers/dom.ts'
import { createRecordingScope } from './helpers/scope.ts'

/** Every style element the plugin owns in a document, found by its own marker. */
function ownedStyleElements(document: ReturnType<typeof createFakeDom>['document']) {
  return document.querySelectorAll(`[${STYLE_ELEMENT_MARKER}]`)
}

describe('plugin-owned styles', () => {
  it('installs one marked style element and removes exactly it', () => {
    const { document } = createFakeDom()
    const release = installStyles(document, '[data-x] { color: inherit; }')

    const installed = ownedStyleElements(document)
    expect(installed).toHaveLength(1)
    expect(installed[0]?.getAttribute(STYLE_ELEMENT_MARKER)).toBe('')
    expect(installed[0]?.textContent).toContain('color: inherit')

    release()
    expect(ownedStyleElements(document)).toHaveLength(0)
    // The head must not keep an empty shell either.
    expect(document.head.descendants()).toHaveLength(0)
  })

  it('is idempotent, so a scope disposal and an explicit release cannot double-remove', () => {
    const { document } = createFakeDom()
    const release = installStyles(document, 'a{}')
    release()
    release()
    expect(ownedStyleElements(document)).toHaveLength(0)
  })

  it('leaves a foreign style element in the head untouched', () => {
    const { document } = createFakeDom()
    const hostStyle = document.createElement('style')
    hostStyle.textContent = 'body{}'
    document.head.appendChild(hostStyle)

    const release = installStyles(document, 'a{}')
    expect(document.head.descendants()).toHaveLength(2)
    release()

    expect(document.head.descendants()).toHaveLength(1)
    expect(document.head.descendants()[0]?.textContent).toBe('body{}')
  })
})

describe('plugin-owned listeners', () => {
  it('detaches the same handler it attached', () => {
    const { document } = createFakeDom()
    const target = document.createElement('div')
    const release = installListener(target, 'input', () => {})

    expect(target.dispatchEvent({ type: 'input' })).toBe(true)
    release()
    expect(target.dispatchEvent({ type: 'input' })).toBe(false)
  })

  it('detaches document-level listeners too', () => {
    const { document } = createFakeDom()
    const release = installListener(document, 'copy', () => {})
    expect(document.listenerCount()).toBe(1)
    release()
    expect(document.listenerCount()).toBe(0)
  })

  it('is idempotent', () => {
    const { document } = createFakeDom()
    const release = installListener(document, 'copy', () => {})
    release()
    release()
    expect(document.listenerCount()).toBe(0)
  })
})

describe('uninstall leaves no residue', () => {
  it('releases every recorded resource and empties the document', () => {
    const { document } = createFakeDom()
    const scope = createRecordingScope()
    const target = document.createElement('div')
    document.body.appendChild(target)

    scope.effect(() => installStyles(document, 'a{}'), 'styles')
    scope.effect(() => installListener(target, 'input', () => {}), 'input listener')
    scope.effect(() => installListener(document, 'copy', () => {}), 'copy listener')

    expect(scope.labels).toEqual(['styles', 'input listener', 'copy listener'])
    expect(document.querySelectorAll(`[${STYLE_ELEMENT_MARKER}]`)).toHaveLength(1)
    expect(document.listenerCount()).toBe(1)

    scope.disposeAll()

    expect(scope.pending()).toBe(0)
    expect(document.querySelectorAll(`[${STYLE_ELEMENT_MARKER}]`)).toHaveLength(0)
    expect(document.listenerCount()).toBe(0)
    expect(target.listenerCount()).toBe(0)
  })

  it('releases in reverse order, so a listener detaches before its node goes', () => {
    // This is the property the recording scope every install test runs against
    // has to hold: a resource registered later may depend on one registered
    // earlier (a listener on a node), so release has to walk backwards.
    const released: string[] = []
    const scope = createRecordingScope()
    scope.effect(() => () => released.push('first'), 'first')
    scope.effect(() => () => released.push('second'), 'second')
    scope.effect(() => () => released.push('third'), 'third')

    scope.disposeAll()

    expect(released).toEqual(['third', 'second', 'first'])
    expect(scope.pending()).toBe(0)
  })

  it('releases each member at most once, so a double dispose is harmless', () => {
    let calls = 0
    const scope = createRecordingScope()
    scope.effect(() => () => {
      calls += 1
    }, 'once')
    scope.disposeAll()
    scope.disposeAll()
    expect(calls).toBe(1)
  })

  it('runs a disposer registered after teardown immediately, so nothing is stranded', () => {
    let calls = 0
    const scope = createRecordingScope()
    scope.disposeAll()
    scope.effect(() => () => {
      calls += 1
    }, 'late')
    expect(calls).toBe(1)
    expect(scope.pending()).toBe(0)
  })
})

describe('the DOM stand-in itself', () => {
  it('keeps the dataset and attribute views in step', () => {
    const { document } = createFakeDom()
    const element = document.createElement('span')
    element.setAttribute('data-dsh-tweaks-plain-text-ref', '')
    expect(element.dataset.dshTweaksPlainTextRef).toBe('')
    element.removeAttribute('data-dsh-tweaks-plain-text-ref')
    expect(element.dataset.dshTweaksPlainTextRef).toBeUndefined()
  })

  it('supports the selector forms the plugin builds', () => {
    const { document } = createFakeDom()
    const openable = document.createElement('span')
    openable.setAttribute('data-composer-text-ref', '')
    openable.setAttribute('class', 'q44v1G_reference q44v1G_textRef q44v1G_openable')
    const handTyped = document.createElement('span')
    handTyped.setAttribute('data-composer-text-ref', '')
    handTyped.setAttribute('class', 'q44v1G_reference q44v1G_textRef')
    document.body.appendChild(openable)
    document.body.appendChild(handTyped)

    expect(document.querySelectorAll('[data-composer-text-ref]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-composer-text-ref]:not([class*="_openable"])')).toHaveLength(1)
    expect(document.querySelector('[data-composer-text-ref]:not([class*="_openable"])')).toBe(handTyped)
  })

  it('refuses a selector form it does not implement instead of matching nothing', () => {
    const { document } = createFakeDom()
    expect(() => document.querySelectorAll('span > b')).toThrow(/unsupported selector fragment/)
  })

  it('detaches a removed node from its parent', () => {
    const { document } = createFakeDom()
    const child = document.createElement('b')
    document.body.appendChild(child)
    child.remove()
    expect(document.body.descendants()).toHaveLength(0)
    expect(child.parentNode).toBeUndefined()
  })

  it('records observers so a test can confirm a disconnect', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const observer = new dom.MutationObserver(() => {})
      observer.observe(dom.document.body)
      expect(observer.isConnected()).toBe(true)
      observer.disconnect()
      expect(observer.isConnected()).toBe(false)
    }
    finally {
      restore()
    }
  })
})

describe('closest, for reading a property off an ancestor', () => {
  it('finds the element itself when it matches', () => {
    const { document } = createFakeDom()
    const host = document.createElement('div')
    host.setAttribute('data-dockkit-host', 'dock')
    document.body.appendChild(host)
    expect(host.closest('[data-dockkit-host]')).toBe(host)
  })

  it('walks up to the nearest matching ancestor, not the outermost', () => {
    const { document } = createFakeDom()
    const outer = document.createElement('div')
    outer.setAttribute('data-dockkit-host', 'float')
    const inner = document.createElement('div')
    inner.setAttribute('data-dockkit-host', 'dock')
    const section = document.createElement('section')
    section.setAttribute('data-dockkit-content', 'tab-1')
    outer.appendChild(inner)
    inner.appendChild(section)
    document.body.appendChild(outer)

    // This is the shape the panel reads: an identity attribute on the inner
    // element, the property it wants on the wrapping host.
    const found = document.querySelector('[data-dockkit-content="tab-1"]')?.closest('[data-dockkit-host]')
    expect(found).toBe(inner)
    expect(found?.getAttribute('data-dockkit-host')).toBe('dock')
  })

  it('returns null when nothing on the way up matches', () => {
    const { document } = createFakeDom()
    const orphan = document.createElement('span')
    document.body.appendChild(orphan)
    expect(orphan.closest('[data-dockkit-host]')).toBeNull()
  })

  it('refuses a descendant selector rather than silently ignoring its first part', () => {
    const { document } = createFakeDom()
    const element = document.createElement('span')
    expect(() => element.closest('div span')).toThrow(/does not support descendant selectors/)
  })
})
