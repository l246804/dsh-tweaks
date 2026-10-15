/**
 * The narrow DOM surface this plugin's patches use.
 *
 * These are structural types, not wrappers: the browser's real `Document` and
 * `Element` satisfy them, and so does the minimal fake in `test/helpers`. That
 * is the whole point: the plugin's DOM code is written against this surface
 * and can therefore be exercised in a plain Node test, with no jsdom dependency
 * and no second implementation of the patch to keep in sync.
 *
 * The surface is deliberately smaller than the DOM. A patch that needs
 * something absent here states its own requirement next to the call site
 * rather than widening this file, which keeps "what the plugin touches in the
 * host's page" a readable list.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/types
 */

/** One node the plugin may read or write. */
export interface ElementLike {
  /** The element's tag name, upper-cased as the DOM reports it. */
  readonly tagName: string
  /** The `data-*` view of the element's attributes, matching its attribute view. */
  readonly dataset: Record<string, string | undefined>
  /** The element's text content; assigning replaces its children's text. */
  textContent: string
  /** The parent node, or undefined at a root. */
  readonly parentNode: ElementLike | undefined
  /** The element's children, in document order. */
  readonly children: Iterable<ElementLike>
  /**
   * Read one attribute.
   * @param name - the attribute name.
   * @returns the value, or null when absent.
   */
  getAttribute: (name: string) => string | null
  /**
   * Set one attribute.
   * @param name - the attribute name.
   * @param value - the value.
   */
  setAttribute: (name: string, value: string) => void
  /**
   * Remove one attribute.
   * @param name - the attribute name.
   */
  removeAttribute: (name: string) => void
  /**
   * Append a child.
   * @param child - the node to append.
   * @returns the appended node.
   */
  appendChild: <T extends ElementLike>(child: T) => T
  /** Detach this node from its parent. */
  remove: () => void
  /**
   * Find the first matching descendant.
   * @param selector - a CSS selector.
   * @returns the element, or null.
   */
  querySelector: (selector: string) => ElementLike | null
  /**
   * Find every matching descendant.
   * @param selector - a CSS selector.
   * @returns the matches, in document order.
   */
  querySelectorAll: (selector: string) => Iterable<ElementLike>
  /**
   * Listen for an event.
   * @param type - the event type.
   * @param listener - the handler.
   */
  addEventListener: (type: string, listener: (event: unknown) => void) => void
  /**
   * Stop listening for an event.
   * @param type - the event type.
   * @param listener - the handler passed to `addEventListener`.
   */
  removeEventListener: (type: string, listener: (event: unknown) => void) => void
}

/** The document the plugin's patches read and write. */
export interface DocumentLike {
  /** The document's head, where plugin-owned styles belong. */
  readonly head: ElementLike
  /**
   * Create an element.
   * @param tagName - the tag name.
   * @returns the new, detached element.
   */
  createElement: (tagName: string) => ElementLike
  /**
   * Find the first matching element.
   * @param selector - a CSS selector.
   * @returns the element, or null.
   */
  querySelector: (selector: string) => ElementLike | null
  /**
   * Find every matching element.
   * @param selector - a CSS selector.
   * @returns the matches, in document order.
   */
  querySelectorAll: (selector: string) => Iterable<ElementLike>
  /**
   * Listen for an event on the document.
   * @param type - the event type.
   * @param listener - the handler.
   */
  addEventListener: (type: string, listener: (event: unknown) => void) => void
  /**
   * Stop listening for an event on the document.
   * @param type - the event type.
   * @param listener - the handler passed to `addEventListener`.
   */
  removeEventListener: (type: string, listener: (event: unknown) => void) => void
}
