/**
 * Seam six: what `install` contributes to the host, and what unload takes back.
 *
 * This feature is the invasive one: it replaces the user message row's
 * renderer outright, which means a bug in its install path is visible as a
 * missing* message row rather than as a broken plugin. Three things therefore
 * have to hold, and only the first is obvious:
 *
 * - The renderer is registered against `conversation.chat.node` under the key
 *   `user` at a priority *below* the host's own (the host registers the same
 *   key at the default priority, so equal priorities would throw).
 * - The copy listener is attached, and unload detaches it and empties the row
 *   registry. A listener outliving its plugin would keep copying for code that
 *   is gone.
 * - Every effect carries a label, so the host's diagnostics can attribute it.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/message-copy/install
 */

import { describe, expect, it, vi } from 'vitest'
import { createFakeDom } from '../../helpers/dom.ts'
import { createRecordingScope } from '../../helpers/scope.ts'

// The row renders the host's icons and tooltip, which come from a browser
// package whose own runtime dependencies are not installed in this Node test
// environment. What this seam asserts is the *registration*, so those atoms are
// replaced with the thinnest things that satisfy their interface.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCopyOutlineRegular: () => null,
  IconCheckOutlineRegular: () => null,
  IconWarningOutlineRegular: () => null,
  Tooltip: ({ children }: { children?: unknown }) => children,
  // The host's own text writer. Its real behavior is the host's and is covered
  // by the host's tests; this stub only has to answer.
  writeClipboard: () => Promise.resolve(true),
}))

const { install } = await import('../../../src/client/features/message-copy/index.ts')

/** The services `install` reaches for, with every registration recorded. */
function fakeContext(dom: ReturnType<typeof createFakeDom>) {
  const scope = createRecordingScope()
  const registrations: { slot: string, options: Record<string, unknown> }[] = []
  const injections: string[] = []
  const dictionaries: { ns: string, locales: unknown }[] = []
  const ctx = {
    effect: scope.effect,
    slots: {
      inject: (slot: string, contribute: () => unknown) => {
        injections.push(slot)
        contribute()
        return () => {}
      },
      register: (options: Record<string, unknown>) => {
        registrations.push({ slot: String(options.name), options })
        return () => {}
      },
    },
    sessions: {},
    locale: {
      register: (ns: string, locales: unknown) => {
        dictionaries.push({ ns, locales })
        return () => {}
      },
    },
  }
  // The listener installs against the real document global, so the stand-in is
  // what `install` finds when it asks.
  void dom
  return { ctx, scope, registrations, injections, dictionaries }
}

describe('installing the message-copy tweak', () => {
  it('takes over the user row renderer below the host\'s own priority', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const { ctx, injections, registrations } = fakeContext(dom)
      install(ctx as never)

      expect(injections).toContain('conversation.chat.node')
      expect(registrations).toHaveLength(1)
      const [entry] = registrations
      expect(entry?.slot).toBe('conversation.chat.node')
      expect(entry?.options.key).toBe('user')
      // The host occupies this key at the default priority 0; only a lower
      // value shadows it, and an equal one throws at registration.
      expect(entry?.options.priority).toBeLessThan(0)
    }
    finally {
      restore()
    }
  })

  it('labels every effect it registers', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const { ctx, scope } = fakeContext(dom)
      install(ctx as never)

      expect(scope.labels.length).toBeGreaterThan(0)
      expect(scope.labels.every(label => label.startsWith('dsh-tweaks: message-copy'))).toBe(true)
    }
    finally {
      restore()
    }
  })

  it('registers its copy for the active locale', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const { ctx, dictionaries } = fakeContext(dom)
      install(ctx as never)

      expect(dictionaries).toHaveLength(1)
      const [entry] = dictionaries
      expect(entry?.ns).toBe('dshTweaksMessageCopy')
      const locales = entry?.locales as Record<string, Record<string, string>>
      expect(Object.keys(locales).sort()).toEqual(['en', 'zh'])
      // Bilingual balance: the two dictionaries carry the same keys.
      expect(Object.keys(locales.en ?? {}).sort()).toEqual(Object.keys(locales.zh ?? {}).sort())
    }
    finally {
      restore()
    }
  })

  it('attaches the copy listener and detaches it on unload, leaving no residue', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const { ctx, scope } = fakeContext(dom)
      install(ctx as never)
      expect(dom.document.listenerCount()).toBe(1)

      scope.disposeAll()

      expect(scope.pending()).toBe(0)
      expect(dom.document.listenerCount()).toBe(0)
    }
    finally {
      restore()
    }
  })

  it('survives a host with no document rather than throwing during boot', () => {
    const { ctx } = fakeContext(createFakeDom())

    expect(() => {
      install(ctx as never)
    }).not.toThrow()
  })

  it('releases its registry when unloaded, so no row content outlives the plugin', () => {
    const dom = createFakeDom()
    const restore = dom.install()
    try {
      const { ctx, scope } = fakeContext(dom)
      install(ctx as never)

      // A copy after unload must not resolve anything: the listener is gone and
      // the registry is empty.
      scope.disposeAll()
      const wrapper = dom.document.createElement('div')
      wrapper.setAttribute('data-chat-flow-kind', 'user')
      wrapper.setAttribute('data-chat-node-key', '4:userm-1')
      dom.document.body.appendChild(wrapper)
      const copy = vi.fn()
      dom.document.dispatchEvent({ type: 'copy', target: wrapper, clipboardData: { setData: copy } })

      expect(copy).not.toHaveBeenCalled()
    }
    finally {
      restore()
    }
  })
})
