/**
 * `HostDom` over this plugin's shared DOM stand-in.
 *
 * The stand-in (`test/helpers/dom.ts`) is written against the plugin's narrow
 * `ElementLike` surface, which has no layout engine and no `closest`. The gaps
 * are closed here rather than by widening the shared helper, so these tests
 * state exactly which DOM abilities the panel depends on.
 *
 * Unlike the panel itself, this adapter never has to invent layout: the panel's
 * DOM work is structural (create, mark, move, detach), and the one operation that
 * does need geometry (centring a row) is injected into the mount, so the tests
 * that care about it supply their own and observe the call. Nothing here has to
 * pretend a Node process performed a layout pass.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/fake-host-dom
 */

import type { HostDom } from '../../../src/client/features/file-panel/panel-host.ts'
import type { FakeDom } from '../../helpers/dom.ts'

/** One node of the stand-in document. */
export type FakeNode = ReturnType<FakeDom['document']['createElement']>

/**
 * Implement {@link HostDom} over the stand-in.
 * @param dom - the stand-in to drive.
 * @returns the operations.
 */
export function fakeHostDom(dom: FakeDom): HostDom<FakeNode> {
  return {
    createElement: tag => dom.document.createElement(tag),
    append: (parent, child) => { parent.appendChild(child) },
    remove: (node) => { node.remove() },
    parentOf: node => node.parentNode,
    childrenOf: node => [...node.children] as FakeNode[],
    setAttribute: (node, name, value) => { node.setAttribute(name, value) },
    removeAttribute: (node, name) => { node.removeAttribute(name) },
    getAttribute: (node, name) => node.getAttribute(name) ?? undefined,
    ancestorWith(node, attribute) {
      let current: FakeNode | undefined = node.parentNode
      while (current !== undefined) {
        if (current.getAttribute(attribute) !== null)
          return current
        current = current.parentNode
      }
      return undefined
    },
  }
}
