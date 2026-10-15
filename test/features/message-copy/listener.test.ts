/**
 * Seam four: the bridge from a document-level `copy` event to the message it
 * belongs to, and its removal on unload.
 *
 * A `copy` event carries no React props, so the listener recovers a message's
 * content by key: mounted rows publish themselves into a registry while they
 * are on screen. The listener and the registry are the two pieces of this
 * feature that touch the document, so they are exactly the two that must
 * release everything on unload, a listener still attached after uninstall
 * would keep copying for a plugin that is no longer loaded, and a registry
 * still holding rows would keep their content alive.
 *
 * The notice for a degraded copy is *the row's* to show, not the listener's:
 * the row is mounted and can put the message where the user is looking, while
 * the listener outlives no particular row. The reporting itself belongs to the
 * shared copy action (`performCopy`), which both routes call, so the two tests
 * at the bottom of this file wire that real action rather than a stub: they are
 * the evidence that a degraded selection copy actually reaches the row.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/listener
 */

import type { ClipboardWriter, CopyOutcome } from '../../../src/client/features/message-copy/clipboard.ts'
import { describe, expect, it, vi } from 'vitest'
import { installCopyListener } from '../../../src/client/features/message-copy/listener.ts'
import { messageContent } from '../../../src/client/features/message-copy/payload.ts'
import { performCopy } from '../../../src/client/features/message-copy/perform-copy.ts'
import { createRowRegistry } from '../../../src/client/features/message-copy/row-registry.ts'
import { copyableRowKey } from '../../../src/client/features/message-copy/selection.ts'
import { createFakeDom } from '../../helpers/dom.ts'

/**
 * What one mounted row publishes about itself.
 * @param key - the row's conversation context key.
 * @param notices - the list this row's own notice reporter appends to.
 * @returns the row's published source.
 */
function source(
  key: string,
  notices: CopyOutcome[] = [],
  content: readonly unknown[] = [{ type: 'text', text: `text of ${key}` }],
) {
  return {
    key,
    content: messageContent(content),
    readImage: () => Promise.resolve(new Blob([])),
    report: (outcome: CopyOutcome) => { notices.push(outcome) },
  }
}

/** Build a copy event whose target is one element. */
function copyEvent(target: unknown, data?: { setData: (type: string, value: string) => void }) {
  return { type: 'copy', target, clipboardData: data }
}

/** One durable image on a copied message. */
const IMAGE = { attachmentId: 'sha256:one', mediaType: 'image/png', bytes: 8, width: 4, height: 2 }

/**
 * Let the copy's asynchronous part settle.
 *
 * The copy decision awaits the host's write, and a rejected byte read adds
 * another tick, so a test that wants the delivered notice has to drain both.
 * @returns a promise resolved after those microtasks.
 */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1)
    await Promise.resolve()
}

/** A host whose text write succeeds and whose structured write is refused. */
function refusingItemsWriter(): ClipboardWriter {
  return {
    canWriteItems: true,
    writeText: () => Promise.resolve(true),
    writeItems: () => Promise.resolve(false),
  }
}

/** A host that refuses everything. */
function brokenWriter(): ClipboardWriter {
  return {
    canWriteItems: false,
    writeText: () => Promise.reject(new Error('clipboard exploded')),
    writeItems: () => Promise.resolve(false),
  }
}

/** A host that only carries text. */
function textOnlyWriter(): ClipboardWriter {
  return {
    canWriteItems: false,
    writeText: () => Promise.resolve(true),
    writeItems: () => Promise.resolve(false),
  }
}

/** A row wrapper carrying the host's two chat-row anchors. */
function rowElement(dom: ReturnType<typeof createFakeDom>, kind: string, key: string) {
  const wrapper = dom.document.createElement('div')
  wrapper.setAttribute('data-chat-flow-kind', kind)
  wrapper.setAttribute('data-chat-node-key', key)
  dom.document.body.appendChild(wrapper)
  return wrapper
}

describe('the row registry', () => {
  it('answers with the row registered under a key', () => {
    const registry = createRowRegistry()
    const row = source('4:userm-1')
    registry.register(row)

    expect(registry.lookup('4:userm-1')).toBe(row)
    expect(registry.lookup('4:userm-2')).toBeUndefined()
  })

  it('forgets a row as soon as its own disposer runs', () => {
    const registry = createRowRegistry()
    const release = registry.register(source('4:userm-1'))

    release()
    expect(registry.lookup('4:userm-1')).toBeUndefined()
    expect(registry.size()).toBe(0)
  })

  it('is idempotent, so an unmount and a scope disposal cannot double-release', () => {
    const registry = createRowRegistry()
    const release = registry.register(source('4:userm-1'))

    release()
    release()
    expect(registry.size()).toBe(0)
  })

  it('a later row with the same key wins, and the earlier one\'s release cannot evict it', () => {
    const registry = createRowRegistry()
    const first = source('4:userm-1')
    const second = source('4:userm-1')
    const releaseFirst = registry.register(first)
    registry.register(second)

    expect(registry.lookup('4:userm-1')).toBe(second)
    releaseFirst()
    expect(registry.lookup('4:userm-1')).toBe(second)
  })

  it('drops everything when the feature unloads', () => {
    const registry = createRowRegistry()
    registry.register(source('4:userm-1'))
    registry.register(source('4:userm-2'))

    registry.clear()
    expect(registry.size()).toBe(0)
  })
})

describe('the document copy listener', () => {
  it('attaches on the document and detaches on unload', () => {
    const { document } = createFakeDom()
    const registry = createRowRegistry()

    const release = installCopyListener(document, { registry, copy: () => Promise.resolve({ status: 'failed' }) })
    expect(document.listenerCount()).toBe(1)

    release()
    expect(document.listenerCount()).toBe(0)
    release()
    expect(document.listenerCount()).toBe(0)
  })

  it('copies the row a selection landed in, resolving it by its anchor key', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const row = source('4:userm-1')
    registry.register(row)
    const copied: unknown[] = []
    const copy = vi.fn((resolved: unknown) => {
      copied.push(resolved)
      return Promise.resolve<CopyOutcome>({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
    })

    const wrapper = rowElement(dom, 'user', '4:userm-1')
    const inner = dom.document.createElement('span')
    wrapper.appendChild(inner)

    installCopyListener(dom.document, { registry, copy })
    dom.document.dispatchEvent(copyEvent(inner))

    expect(copy).toHaveBeenCalledTimes(1)
    expect(copied).toEqual([row])
  })

  it('hands the event its own data channel, so the text can land synchronously', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    registry.register(source('4:userm-1'))
    const data = { setData: vi.fn() }
    const copy = vi.fn((_source: unknown, channel: unknown) => {
      expect(channel).toBe(data)
      return Promise.resolve<CopyOutcome>({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
    })

    const target = rowElement(dom, 'user', '4:userm-1')
    installCopyListener(dom.document, { registry, copy })
    dom.document.dispatchEvent(copyEvent(target, data))

    expect(copy).toHaveBeenCalledTimes(1)
  })

  it('passes no channel when the event offered none', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    registry.register(source('4:userm-1'))
    const copy = vi.fn((_source: unknown, channel: unknown) => {
      expect(channel).toBeUndefined()
      return Promise.resolve<CopyOutcome>({ status: 'copied', attachmentsIncluded: false, omittedImages: 0 })
    })

    const target = rowElement(dom, 'user', '4:userm-1')
    installCopyListener(dom.document, { registry, copy })
    dom.document.dispatchEvent(copyEvent(target))

    expect(copy).toHaveBeenCalledTimes(1)
  })

  it('leaves the host\'s own copy alone outside a user row', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const copy = vi.fn(() => Promise.resolve<CopyOutcome>({ status: 'failed' }))
    installCopyListener(dom.document, { registry, copy })

    for (const kind of ['assistant', 'tool', 'steering', 'turn-process']) {
      dom.document.dispatchEvent(copyEvent(rowElement(dom, kind, `${kind}:1`)))
    }
    dom.document.dispatchEvent(copyEvent(dom.document.body))

    expect(copy).not.toHaveBeenCalled()
  })

  it('does nothing when the row has not published itself', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const copy = vi.fn(() => Promise.resolve<CopyOutcome>({ status: 'failed' }))

    const target = rowElement(dom, 'user', '4:userm-9')
    installCopyListener(dom.document, { registry, copy })
    dom.document.dispatchEvent(copyEvent(target))

    expect(copy).not.toHaveBeenCalled()
  })

  it('delivers a degraded selection copy to the row as a notice', async () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const notices: CopyOutcome[] = []
    // A message with an image, on a host that refuses the structured write: the
    // text lands and the attachment does not, which the user must be told.
    const row = source('4:userm-1', notices, [
      { type: 'text', text: 'see this' },
      { type: 'image', attachment: IMAGE },
    ])
    registry.register(row)

    const target = rowElement(dom, 'user', '4:userm-1')
    const data = { setData: vi.fn() }
    // The real action, exactly as `install` wires it to the listener.
    installCopyListener(dom.document, {
      registry,
      copy: (resolved, channel) => performCopy(resolved, channel, refusingItemsWriter()),
    })
    dom.document.dispatchEvent(copyEvent(target, data))

    // Asserted BEFORE any await: the event's channel is filled during the
    // handler's own synchronous turn, which is the only turn a browser accepts
    // custom clipboard data in. If this ever moved behind an await, the
    // assertion below would fail even though the copy eventually "succeeded".
    expect(data.setData).toHaveBeenCalledWith('text/plain', 'see this')

    await settle()
    expect(notices).toEqual([{ status: 'text-only', reason: 'denied' }])
  })

  it('delivers a total failure to the row rather than leaving the user with no feedback', async () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const notices: CopyOutcome[] = []
    registry.register(source('4:userm-1', notices))

    const target = rowElement(dom, 'user', '4:userm-1')
    installCopyListener(dom.document, {
      registry,
      copy: (resolved, channel) => performCopy(resolved, channel, brokenWriter()),
    })
    dom.document.dispatchEvent(copyEvent(target))
    await settle()

    expect(notices).toEqual([{ status: 'failed' }])
  })

  it('delivers a plain-text copy as a success, so the row shows its check', async () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const notices: CopyOutcome[] = []
    registry.register(source('4:userm-1', notices))

    const target = rowElement(dom, 'user', '4:userm-1')
    installCopyListener(dom.document, {
      registry,
      copy: (resolved, channel) => performCopy(resolved, channel, textOnlyWriter()),
    })
    dom.document.dispatchEvent(copyEvent(target))
    await settle()

    expect(notices).toEqual([{ status: 'copied', attachmentsIncluded: false, omittedImages: 0 }])
  })

  it('stops answering a key the moment its row publishes a release', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const release = registry.register(source('4:userm-1'))
    const copy = vi.fn(() => Promise.resolve<CopyOutcome>({ status: 'failed' }))
    installCopyListener(dom.document, { registry, copy })

    const target = rowElement(dom, 'user', '4:userm-1')
    release()
    dom.document.dispatchEvent(copyEvent(target))

    expect(copy).not.toHaveBeenCalled()
  })

  it('survives an event whose shape is not what a browser promises', () => {
    const dom = createFakeDom()
    const registry = createRowRegistry()
    const copy = vi.fn(() => Promise.resolve<CopyOutcome>({ status: 'failed' }))
    installCopyListener(dom.document, { registry, copy })

    expect(() => {
      dom.document.dispatchEvent({ type: 'copy' })
    }).not.toThrow()
    expect(() => {
      dom.document.dispatchEvent({ type: 'copy', target: null, clipboardData: 7 })
    }).not.toThrow()
    expect(copy).not.toHaveBeenCalled()
  })
})

describe('the anchor lookup the listener depends on', () => {
  it('agrees with the listener about which key a node resolves to', () => {
    const dom = createFakeDom()
    const wrapper = rowElement(dom, 'user', '4:userm-7')

    expect(copyableRowKey(wrapper)).toBe('4:userm-7')
  })
})
