/**
 * From a text selection back to the chat row it belongs to.
 *
 * The host ships no document-level `copy` listener, so covering "select the
 * text and copy" means adding one, and the first question that listener has to
 * answer is *which message* the selection is inside. A `copy` event carries no
 * React props, so the answer can only come from the DOM.
 *
 * It comes from the wrapper the host itself renders around every chat node
 * (`ChatNodeSeat`), which carries two stable attributes: `data-chat-flow-kind`
 * (the renderer kind) and `data-chat-node-key` (the conversation context key
 * the row's node is stored under). Neither is a hashed CSS-module class name,
 * and both are part of the host's own documented anchor set.
 *
 * The module is written against the plugin's narrow `ElementLike` surface, so
 * the same code runs in the browser and under the test's DOM stand-in.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/message-copy/selection
 */

import type { ElementLike } from '../../dom/types.ts'

/** The host's attribute naming a chat row's renderer kind. */
const FLOW_KIND_ATTRIBUTE = 'data-chat-flow-kind'

/** The host's attribute naming a chat row's conversation context key. */
const NODE_KEY_ATTRIBUTE = 'data-chat-node-key'

/** The row kind whose copy this feature owns. */
const USER_ROW_KIND = 'user'

/** One resolved chat row. */
export interface ChatRowIdentity {
  /** The row's renderer kind, as `data-chat-flow-kind` reports it. */
  readonly kind: string
  /** The row's conversation context key, as `data-chat-node-key` reports it. */
  readonly key: string
}

/**
 * Resolve the nearest enclosing chat row of a node.
 *
 * "Nearest" matters: a grouped row nests its members' wrappers, and a
 * selection inside a member belongs to that member, not to the group.
 * @param start - the node the selection or event landed on, if any.
 * @returns the row's kind and key, or undefined when there is no such row.
 */
export function chatRowKey(start: ElementLike | undefined): ChatRowIdentity | undefined {
  for (let node = start; node !== undefined; node = node.parentNode) {
    const key = node.getAttribute(NODE_KEY_ATTRIBUTE)
    const kind = node.getAttribute(FLOW_KIND_ATTRIBUTE)
    if (key !== null && kind !== null)
      return { kind, key }
  }
  return undefined
}

/**
 * Resolve the conversation context key of the user row a node is inside.
 *
 * Every other row kind is deliberately refused. This feature only reproduces
 * the user message row, so it can only vouch for that row's content; a
 * selection inside an assistant or tool row must keep the browser's own
 * behavior rather than have this plugin overwrite it with something it cannot
 * build faithfully.
 * @param start - the node the selection or event landed on, if any.
 * @returns the user row's context key, or undefined when the node is not inside one.
 */
export function copyableRowKey(start: ElementLike | undefined): string | undefined {
  const row = chatRowKey(start)
  return row?.kind === USER_ROW_KIND ? row.key : undefined
}

/**
 * The element a `copy` event's target belongs to.
 *
 * A selection's target is frequently a `Text` node, which has no attributes
 * and no `closest`; its parent element is what carries the row anchor. The
 * argument is typed loosely because the event is untrusted input: anything
 * that is not element-shaped resolves to undefined rather than throwing inside
 * a copy handler.
 * @param target - the event's `target`.
 * @returns the target as an element, its parent element, or undefined.
 */
export function targetElement(target: unknown): ElementLike | undefined {
  if (typeof target !== 'object' || target === null)
    return undefined
  const candidate = target as Partial<ElementLike> & { parentElement?: unknown }
  if (typeof candidate.getAttribute === 'function' && typeof candidate.parentNode !== 'undefined')
    return candidate as ElementLike
  const parent = candidate.parentElement
  if (typeof parent === 'object' && parent !== null && typeof (parent as ElementLike).getAttribute === 'function')
    return parent as ElementLike
  return undefined
}
