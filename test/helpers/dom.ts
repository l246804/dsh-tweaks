/**
 * A minimal DOM stand-in, written for this plugin and used only by its tests.
 *
 * Two decisions shape it. First, it satisfies the plugin's own `DocumentLike` /
 * `ElementLike` structural types, so production code and tests share one
 * implementation of every patch: a wrapper would let the two drift, which is
 * exactly the failure a DOM-patch-heavy plugin cannot afford. Second, it
 * implements only the subset the plugin is allowed to touch, so a patch that
 * reaches for something outside its budget fails in a test rather than in a
 * user's browser.
 *
 * Selector support is deliberate about its own limits: tag, attribute presence,
 * exact attribute value, substring attribute value, descendant combination and
 * `:not([attr])`. That covers every selector this plugin builds, and an
 * unsupported form throws instead of silently matching nothing.
 *
 * @module @leiwang2000/dsh-tweaks/test/helpers/dom
 */

import type { DocumentLike, ElementLike } from '../../src/client/dom/types.ts'

/**
 * One listener registry, shared by elements and the document.
 *
 * Both need exactly this behaviour, and a single implementation keeps the two
 * from drifting apart in a way the plugin's own tests would not notice.
 */
class ListenerRegistry {
  private readonly groups = new Map<string, Set<(event: unknown) => void>>()

  add(type: string, listener: (event: unknown) => void): void {
    const group = this.groups.get(type) ?? new Set()
    group.add(listener)
    this.groups.set(type, group)
  }

  remove(type: string, listener: (event: unknown) => void): void {
    this.groups.get(type)?.delete(listener)
  }

  /** Run every listener for an event type; reports whether any ran. */
  dispatch(event: { type: string, [key: string]: unknown }): boolean {
    const group = this.groups.get(event.type)
    if (group === undefined || group.size === 0)
      return false
    for (const listener of [...group]) listener(event)
    return true
  }

  /** Total live listeners, so a test can assert nothing was left attached. */
  count(): number {
    let total = 0
    for (const group of this.groups.values()) total += group.size
    return total
  }
}

/** One stand-in element. */
class FakeElement implements ElementLike {
  readonly tagName: string
  readonly dataset: Record<string, string | undefined> = {}
  readonly attributes = new Map<string, string>()
  textContent = ''
  parentNode: FakeElement | undefined
  private readonly childNodes: FakeElement[] = []
  private readonly listeners = new ListenerRegistry()

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  get children(): Iterable<FakeElement> {
    return [...this.childNodes]
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    // `dataset` and the attribute view are two names for the same value in a
    // real DOM; the plugin's own CSS-injection path reads one and writes the
    // other, so the stand-in keeps them in step in both directions.
    const key = datasetKeyOf(name)
    if (key !== undefined)
      this.dataset[key] = value
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
    const key = datasetKeyOf(name)
    if (key !== undefined)
      delete this.dataset[key]
  }

  appendChild<T extends ElementLike>(child: T): T {
    const appended: FakeElement = child instanceof FakeElement ? child : throwNotAnElement()
    appended.parentNode?.removeChild(appended)
    appended.parentNode = this
    this.childNodes.push(appended)
    return child
  }

  /** Alias for {@link appendChild}, matching the DOM's `append`. */
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node)
  }

  remove(): void {
    this.parentNode?.removeChild(this)
  }

  private removeChild(child: FakeElement): void {
    const index = this.childNodes.indexOf(child)
    if (index < 0)
      return
    this.childNodes.splice(index, 1)
    // Real DOM nodes keep a null parent after removal; clearing it is what makes
    // `isConnected`-style checks in a test truthful.
    child.parentNode = undefined
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = []
    collectMatches(this, selectorsOf(selector), matches)
    return matches
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.add(type, listener)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.remove(type, listener)
  }

  /** Dispatch an event to this element's listeners; returns whether any ran. */
  dispatchEvent(event: { type: string, [key: string]: unknown }): boolean {
    return this.listeners.dispatch(event)
  }

  /** Live listener count, so a test can assert nothing was left attached. */
  listenerCount(): number {
    return this.listeners.count()
  }

  /** Descendants in document order, excluding this element. */
  descendants(): FakeElement[] {
    const all: FakeElement[] = []
    walk(this, all)
    return all
  }
}

/** The stand-in document. */
class FakeDocument implements DocumentLike {
  readonly head = new FakeElement('head')
  readonly body = new FakeElement('body')
  readonly documentElement: FakeElement
  private readonly listeners = new ListenerRegistry()

  constructor() {
    this.documentElement = new FakeElement('html')
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName)
  }

  createTextNode(text: string): { textContent: string, nodeType: number } {
    return { textContent: text, nodeType: 3 }
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = []
    collectMatches(this.body, selectorsOf(selector), matches)
    // The head is outside the body in a real document; a plugin-owned style
    // element lands there, so both roots are searched.
    collectMatches(this.head, selectorsOf(selector), matches)
    return matches
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.add(type, listener)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.remove(type, listener)
  }

  /** Dispatch a document-level event; returns whether any listener ran. */
  dispatchEvent(event: { type: string, [key: string]: unknown }): boolean {
    return this.listeners.dispatch(event)
  }

  /** Live document-level listener count. */
  listenerCount(): number {
    return this.listeners.count()
  }
}

/** A DOM stand-in plus the globals a client bundle may expect to find. */
/** The observation face a test uses to confirm a plugin disconnected. */
interface FakeObserver {
  /** Whether this observer still watches anything. */
  readonly isConnected: () => boolean
}

/**
 * The constructors a client bundle may expect to find on the page.
 *
 * `observe` is typed against the stand-in's own element type, so a test passes
 * a stand-in node rather than an arbitrary value.
 */
interface FakeGlobals {
  readonly MutationObserver: new (callback: (records: readonly unknown[]) => void) => FakeObserver & {
    observe: (target: FakeElement, options?: unknown) => void
    disconnect: () => void
    takeRecords: () => unknown[]
  }
  readonly ResizeObserver: new (callback: (entries: readonly unknown[]) => void) => FakeObserver & {
    observe: (target: FakeElement) => void
    unobserve: (target: FakeElement) => void
    disconnect: () => void
  }
}

/** A DOM stand-in plus the globals a client bundle may expect to find. */
export interface FakeDom extends FakeGlobals {
  readonly document: FakeDocument
  /**
   * Install the stand-in as `globalThis.document` and its constructors.
   * @returns the function that restores whatever was there before.
   */
  install: () => () => void
}

/**
 * Create a DOM stand-in.
 *
 * `MutationObserver`, `requestAnimationFrame` and `ResizeObserver` are provided
 * as functional-but-not-real implementations: enough for a plugin that
 * registers them to install and uninstall cleanly, which is what these tests
 * assert. `MutationObserver` records the elements it observes so a test can
 * confirm a disconnect, and never fabricates mutation records. A plugin that
 * depended on real observation would fail loudly rather than pass falsely.
 * @returns the stand-in and its global installer.
 */
export function createFakeDom(): FakeDom {
  const document = new FakeDocument()
  let installed: (() => void) | undefined

  class FakeMutationObserver {
    private observed: FakeElement[] = []
    constructor(private readonly callback: (records: readonly unknown[]) => void) {}
    observe(target: FakeElement, options?: unknown): void {
      void this.callback
      void options
      this.observed.push(target)
    }

    disconnect(): void {
      this.observed = []
    }

    takeRecords(): unknown[] {
      return []
    }

    /** Whether this observer still watches anything. */
    isConnected(): boolean {
      return this.observed.length > 0
    }
  }

  class FakeResizeObserver {
    private observed: FakeElement[] = []
    constructor(private readonly callback: (entries: readonly unknown[]) => void) {}
    observe(target: FakeElement): void {
      void this.callback
      this.observed.push(target)
    }

    unobserve(target: FakeElement): void {
      this.observed = this.observed.filter(element => element !== target)
    }

    disconnect(): void {
      this.observed = []
    }

    isConnected(): boolean {
      return this.observed.length > 0
    }
  }

  const globals = globalThis as Record<string, unknown>

  return {
    document,
    MutationObserver: FakeMutationObserver,
    ResizeObserver: FakeResizeObserver,
    install: () => {
      const previous = new Map<string, unknown>()
      const set = (name: string, value: unknown): void => {
        previous.set(name, globals[name])
        globals[name] = value
      }
      set('document', document)
      set('MutationObserver', FakeMutationObserver)
      set('ResizeObserver', FakeResizeObserver)
      set('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 16))
      set('cancelAnimationFrame', (handle: unknown) => clearTimeout(handle as never))
      set('matchMedia', () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
      installed = () => {
        for (const [name, value] of previous) {
          if (value === undefined)
            delete globals[name]
          else globals[name] = value
        }
      }
      return installed
    },
  }
}

/** Reject a node that this stand-in did not create, rather than store a foreign shape. */
function throwNotAnElement(): never {
  throw new Error('fake-dom: appendChild received a node this stand-in did not create')
}

/** Convert an attribute name to its dataset key, or undefined when it is not a `data-*` attribute. */
function datasetKeyOf(attribute: string): string | undefined {
  if (!attribute.startsWith('data-') || attribute.length <= 'data-'.length)
    return undefined
  return attribute
    .slice('data-'.length)
    .replace(/-([a-z0-9])/gu, (_match, character: string) => character.toUpperCase())
}

/** Descend into `root`, appending every child in document order. */
function walk(root: FakeElement, into: FakeElement[]): void {
  for (const child of root.children) {
    into.push(child)
    walk(child, into)
  }
}

/** One parsed compound selector: a tag, plus every attribute condition in order. */
interface CompoundSelector {
  readonly tag?: string
  readonly conditions: readonly AttributeCondition[]
}

/** One attribute condition inside a compound selector. */
interface AttributeCondition {
  readonly attribute: string
  readonly value?: string
  readonly contains?: string
  readonly negated?: boolean
}

/** Split a descendant selector into its compound parts. */
function selectorsOf(selector: string): CompoundSelector[] {
  const trimmed = selector.trim()
  if (trimmed === '')
    throw new Error('fake-dom: empty selector')
  return trimmed.split(/\s+/u).map(parseCompound)
}

/** Matches one attribute fragment at the start of a string, in any of its three forms. */
const ATTRIBUTE_PATTERN = /^\[([^\]=*]+)(?:(\*?)=(?:"([^"]*)"|([^\]]*)))?\]/u
/** Matches a `:not([...])` fragment at the start of a string. */
const NOT_PATTERN = /^:not\((\[[^\]]*\])\)/u

/**
 * Parse one compound selector such as `span[data-x]:not([data-y])`.
 *
 * Fragments are consumed from the front one at a time, so any combination of a
 * tag, attribute tests and `:not()` works without enumerating the orders.
 */
function parseCompound(part: string): CompoundSelector {
  let rest = part
  let tag: string | undefined
  const tagMatch = /^[A-Za-z][\w-]*/u.exec(rest)
  if (tagMatch !== null) {
    // CSS type selectors are case-insensitive in an HTML document.
    tag = tagMatch[0].toUpperCase()
    rest = rest.slice(tagMatch[0].length)
  }
  const conditions: AttributeCondition[] = []
  while (rest.length > 0) {
    const notMatch = NOT_PATTERN.exec(rest)
    if (notMatch !== null) {
      conditions.push({ ...parseAttributeFragment(notMatch[1]!), negated: true })
      rest = rest.slice(notMatch[0].length)
      continue
    }
    const attributeMatch = ATTRIBUTE_PATTERN.exec(rest)
    if (attributeMatch === null) {
      throw new Error(`fake-dom: unsupported selector fragment ${JSON.stringify(rest)}`)
    }
    const [, attribute, operator, quoted, bare] = attributeMatch
    const value = quoted ?? bare
    conditions.push(operator === '*'
      ? { attribute: attribute!, contains: value ?? '' }
      : value === undefined ? { attribute: attribute! } : { attribute: attribute!, value })
    rest = rest.slice(attributeMatch[0].length)
  }
  if (tag === undefined && conditions.length === 0) {
    throw new Error(`fake-dom: unsupported selector ${JSON.stringify(part)}`)
  }
  return { tag, conditions }
}

/** Parse one bracketed attribute fragment, such as `[class*="_openable"]`. */
function parseAttributeFragment(fragment: string): AttributeCondition {
  const match = ATTRIBUTE_PATTERN.exec(fragment)
  if (match === null || match[0].length !== fragment.length) {
    throw new Error(`fake-dom: unsupported attribute fragment ${JSON.stringify(fragment)}`)
  }
  const [, attribute, operator, quoted, bare] = match
  const value = quoted ?? bare
  if (operator === '*')
    return { attribute: attribute!, contains: value ?? '' }
  return value === undefined ? { attribute: attribute! } : { attribute: attribute!, value }
}

/** Whether an element satisfies one compound selector. */
function matchesCompound(element: FakeElement, compound: CompoundSelector): boolean {
  if (compound.tag !== undefined && element.tagName !== compound.tag)
    return false
  for (const condition of compound.conditions) {
    const actual = element.getAttribute(condition.attribute)
    const present = actual !== null
    let satisfied: boolean
    if (condition.contains !== undefined)
      satisfied = actual?.includes(condition.contains) === true
    else if (condition.value !== undefined)
      satisfied = actual === condition.value
    else satisfied = present
    if (condition.negated === true)
      satisfied = !satisfied
    if (!satisfied)
      return false
  }
  return true
}

/** Whether an element matches a whole (possibly descendant) selector. */
function matchesSelector(element: FakeElement, selector: readonly CompoundSelector[]): boolean {
  const last = selector[selector.length - 1]!
  if (!matchesCompound(element, last))
    return false
  let ancestor = element.parentNode
  for (let index = selector.length - 2; index >= 0; index -= 1) {
    const step = selector[index]!
    let found = false
    while (ancestor !== undefined) {
      if (matchesCompound(ancestor, step)) {
        found = true
        ancestor = ancestor.parentNode
        break
      }
      ancestor = ancestor.parentNode
    }
    if (!found)
      return false
  }
  return true
}

/** Collect everything under `root` matching `selector`, in document order. */
function collectMatches(root: FakeElement, selector: CompoundSelector[], into: FakeElement[]): void {
  for (const child of root.children) {
    if (matchesSelector(child, selector))
      into.push(child)
    collectMatches(child, selector, into)
  }
}
