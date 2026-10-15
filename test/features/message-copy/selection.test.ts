/**
 * Seam three: from a text selection back to the message row it belongs to.
 *
 * The host has no document-level `copy` listener, so covering "select some
 * text and copy" means adding one. The hard part is not the listener; it is
 * deciding *which* message a selection belongs to, and the only information
 * available at that point is the DOM: the `copy` event carries no React props.
 *
 * The host's own row wrapper is the anchor, and it is stable by contract
 * (`data-chat-flow-kind` and `data-chat-node-key` on the wrapper
 * `ChatNodeSeat` renders). These tests walk a stand-in DOM that reproduces
 * that wrapper and assert the two properties the feature depends on: a
 * selection anywhere inside a user row resolves to that row's key, and a
 * selection outside one, or in a row this plugin does not own, resolves to
 * nothing rather than to a guess.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/selection
 */

import type { ElementLike } from '../../../src/client/dom/types.ts'
import { describe, expect, it } from 'vitest'
import { chatRowKey, copyableRowKey } from '../../../src/client/features/message-copy/selection.ts'
import { createFakeDom } from '../../helpers/dom.ts'

/**
 * Build a stand-in of the host's row wrapper.
 * @param dom - the stand-in document factory.
 * @param kind - the row's chat flow kind.
 * @param key - the row's conversation context key.
 * @returns the wrapper element, to append row content into.
 */
function row(dom: ReturnType<typeof createFakeDom>, kind: string, key: string): ElementLike {
  const wrapper = dom.document.createElement('div')
  wrapper.setAttribute('data-chat-flow-kind', kind)
  wrapper.setAttribute('data-chat-node-key', key)
  dom.document.body.appendChild(wrapper)
  return wrapper
}

describe('resolving a selected node to its chat row', () => {
  it('resolves from a nested element up to the row wrapper', () => {
    const dom = createFakeDom()
    const userRow = row(dom, 'user', '4:userm-1')
    const inner = dom.document.createElement('span')
    const text = dom.document.createElement('b')
    inner.appendChild(text)
    userRow.appendChild(inner)

    expect(chatRowKey(text)).toEqual({ kind: 'user', key: '4:userm-1' })
  })

  it('resolves from the row wrapper itself', () => {
    const dom = createFakeDom()
    const userRow = row(dom, 'user', '4:userm-2')

    expect(chatRowKey(userRow)).toEqual({ kind: 'user', key: '4:userm-2' })
  })

  it('resolves to the nearest row, not the outermost one', () => {
    const dom = createFakeDom()
    // A grouped row nests another row wrapper inside it, which is exactly how
    // the host renders grouped nodes.
    const group = row(dom, 'group', 'group:1')
    const userRow = row(dom, 'user', '4:userm-3')
    group.appendChild(userRow)
    const inner = dom.document.createElement('span')
    userRow.appendChild(inner)

    expect(chatRowKey(inner)).toEqual({ kind: 'user', key: '4:userm-3' })
  })

  it('resolves nothing for a node outside every row', () => {
    const dom = createFakeDom()
    const stray = dom.document.createElement('span')
    dom.document.body.appendChild(stray)

    expect(chatRowKey(stray)).toBeUndefined()
    expect(chatRowKey(undefined)).toBeUndefined()
  })

  it('resolves nothing when the wrapper carries no key', () => {
    const dom = createFakeDom()
    const wrapper = dom.document.createElement('div')
    wrapper.setAttribute('data-chat-flow-kind', 'user')
    dom.document.body.appendChild(wrapper)

    expect(chatRowKey(wrapper)).toBeUndefined()
  })
})

describe('deciding whether a row is this plugin\'s to copy', () => {
  it('accepts a user row', () => {
    const dom = createFakeDom()
    const userRow = row(dom, 'user', '4:userm-4')

    expect(copyableRowKey(userRow)).toBe('4:userm-4')
  })

  it('leaves a steering row to the host, whose own copy control owns it', () => {
    const dom = createFakeDom()
    const steeringRow = row(dom, 'steering', '8:steeringm-5')

    expect(copyableRowKey(steeringRow)).toBeUndefined()
  })

  it('leaves every other row kind alone', () => {
    const dom = createFakeDom()
    for (const kind of ['assistant', 'tool', 'turn-process', 'context', 'turn-tail']) {
      const other = row(dom, kind, `${kind}:1`)
      expect(copyableRowKey(other)).toBeUndefined()
    }
  })

  it('resolves nothing outside a row', () => {
    const dom = createFakeDom()
    expect(copyableRowKey(dom.document.body)).toBeUndefined()
  })
})
