/**
 * The client entry loaded into a **real** cordis runtime, over the DOM stand-in.
 *
 * Every other suite in this repo installs a feature into a hand-written context
 * object (`open-row-scene.ts` is the fullest example) and that context is more
 * permissive than cordis: it hands the feature `remote: { workspaceFiles: … }`
 * as one plain property. Cordis does not. `ctx.remote` is a traceable proxy
 * whose tracker is `associate: 'remote'`, so reading a *namespace member* is
 * re-dispatched to `Reflect.get(ctx, 'remote.workspaceFiles')`, a service of its
 * own, gated by the consuming fiber's `inject`, exactly like any other service.
 * A fake context that spells the namespace out cannot see that gate, which is
 * how a missing `inject` entry stays green in every test that does not use
 * cordis.
 *
 * So this scene supplies the missing layer and nothing else. It builds the
 * smallest runtime that behaves the way the shell does at the one point that
 * matters:
 *
 * - `remote` and `remote.workspaceFiles` are registered as **two `Service`
 *   subclasses mounted by two different fibers**, which is how the api-gateway
 *   mounts them (`RemoteNamespaceService` is constructed under a plugin fiber
 *   named `remote.workspaceFiles`, not in the carrier's own fiber). Registering
 *   the namespace directly on the root context instead would hide the bug: a
 *   root-level provision is reachable by the fallback walk up the fiber chain,
 *   and the gate only bites for a sibling fiber's provision.
 * - The page the plugin patches is the project's own DOM stand-in, so the tab
 *   body the docking looks for is drawn the way the kit draws it.
 * - The panel's React root is mocked (`react-dom/client` cannot load in plain
 *   Node), so the element the root was handed is what this scene inspects. That
 *   element is rendered to static markup through the *real* React server
 *   renderer, so the text a reader would see is the text asserted on, including
 *   the panel's own failure copy.
 *
 * What is real: the cordis runtime, its fibers, its inject gate, the entry's
 * `apply` and every feature it installs, the docking loop, the panel controller,
 * the view, the locale interpolation and the namespace's `list` call. What is
 * substituted: the four host services (`slots`, `sidebarRight`,
 * `sidebarRightTabs`, `sessions`, `locale`, `remote`) reduced to the members the
 * plugin calls, the Remote namespaces' transport, and React's browser root.
 *
 * @module @leiwang2000/dsh-tweaks/test/client-entry/scene
 */

import type { ReactElement } from 'react'
import type { FakeDom } from '../helpers/dom.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import { renderToStaticMarkup } from 'react-dom/server'
import { createFakeDom } from '../helpers/dom.ts'

/** The session the scene's sidebar is showing. */
export const SESSION_ID = 's1'

/** The session's workspace root, as its catalog row reports it. */
export const WORKSPACE_ROOT = '/w'

/** The tab the scene shows: the built-in file list's own page. */
export const FILES_TAB_ID = 'tab-files'

/**
 * The root listing the namespace answers with.
 *
 * Two entries, one of each kind, so the rendered tree has something to prove: a
 * row per entry is what "the listing arrived" looks like on screen. It is this
 * module's own fixture; the test states its expectations as literals rather than
 * deriving them from here, so changing the listing cannot make an assertion
 * agree with itself.
 */
const ROOT_ENTRIES = [
  { name: 'src', type: 'directory' as const },
  { name: 'README.md', type: 'file' as const, size: 12 },
]

/** One value a test reads synchronously and subscribes to. */
interface Observable<Value> {
  /** The current value. */
  readonly getSnapshot: () => Value
  /** Subscribe to changes. */
  readonly subscribe: (listener: () => void) => () => void
}

/** One directory listing the namespace was asked for. */
interface ListCall {
  /** The session the listing was scoped to. */
  readonly sessionId: string
  /** The absolute directory path the panel asked for. */
  readonly path: string
}

/** A value plus a way to publish a new one. */
function observable<Value>(initial: Value): Observable<Value> & { readonly set: (next: Value) => void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * The slot registry, reduced to the two calls the plugin makes.
 *
 * `inject` runs its callback immediately, which is what the real registry does
 * for a seat that is already declared: this scene declares every seat the plugin
 * contributes to, so none of its contributions is held back.
 */
class SlotsService extends Service {
  /** Every seat the plugin waited for, in order. */
  readonly injected: string[] = []
  /** Every registration the plugin made, as its identity options. */
  readonly registrations: { readonly name: string, readonly key?: string, readonly id?: string }[] = []

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  inject(key: string, body: () => () => void): () => void {
    this.injected.push(key)
    const dispose = body()
    return () => {
      dispose()
    }
  }

  register(options: { readonly name: string, readonly key?: string, readonly id?: string }): () => void {
    this.registrations.push(options)
    return () => {}
  }
}

/**
 * The locale registry: the plugin's own dictionaries, interpolated.
 *
 * `bind` reads the dictionaries the plugin registered, so the copy asserted on
 * below is the plugin's real string with its real substitution. The line
 * `读取失败：…` is `error.unavailable` from `locales.ts`, interpolated here, not a
 * string this harness invented.
 */
class LocaleService extends Service {
  private readonly dictionaries = new Map<string, Record<string, Record<string, string>>>()

  constructor(ctx: Context) {
    super(ctx, 'locale')
  }

  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void {
    this.dictionaries.set(namespace, dictionaries)
    return () => {
      this.dictionaries.delete(namespace)
    }
  }

  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string {
    return (key, params) => {
      const template = this.dictionaries.get(namespace)?.zh?.[key] ?? key
      if (params === undefined)
        return template
      return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name]))
    }
  }
}

/** The tab-type registry, reduced to `register`. */
class SidebarRightTabsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sidebarRightTabs')
  }

  register(): () => void {
    return () => {}
  }
}

/** One tab record as the sidebar publishes it. */
interface TabRecord {
  readonly id: string
  readonly kind: string
  readonly contentId: string
  readonly title: string
}

/**
 * The right sidebar's navigation face.
 *
 * One session on screen, one open tab, and no mutation: this scene drives the
 * listing, not a click, so the open/close calls exist to fail loudly if a future
 * change reaches for them here rather than to be exercised.
 */
class SidebarRightService extends Service {
  readonly mounted = observable<string | undefined>(SESSION_ID)
  readonly openTabs = observable<readonly { readonly sessionId: string, readonly tabId: string, readonly kind: string, readonly contentId: string }[]>([])

  private readonly records: readonly TabRecord[] = [
    { id: FILES_TAB_ID, kind: 'files', contentId: 'files', title: 'Files' },
  ]

  constructor(ctx: Context) {
    super(ctx, 'sidebarRight')
    this.openTabs.set([{ sessionId: SESSION_ID, tabId: FILES_TAB_ID, kind: 'files', contentId: 'files' }])
  }

  active(): TabRecord | undefined {
    return this.records[0]
  }

  tabsIn(): readonly TabRecord[] {
    return this.records
  }

  openResourceIn(): void {}
  openResource(): void {}
  focus(): void {}
  closeIn(): void {}
  close(): void {}
}

/** The session list, reduced to the workspace root the docking reads. */
class SessionsService extends Service {
  readonly list = {
    getSnapshot: () => ({ byId: { [SESSION_ID]: { cwd: WORKSPACE_ROOT } } }),
  }

  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }

  binding(): undefined {
    return undefined
  }
}

/**
 * The Remote carrier.
 *
 * Only `$stream` is here: the supervised watch is not what this scene is about,
 * and the carrier's other members would be a second implementation of the
 * gateway. `$stream` returns a handle whose iterator ends immediately, so the
 * panel's watch finishes instead of parking, and the listing path under test is
 * the only thing left running.
 */
class RemoteService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  get $stream(): (options: { readonly open: (signal: AbortSignal) => AsyncIterable<never> }) => {
    readonly [Symbol.asyncIterator]: () => AsyncIterator<never>
    readonly dispose: () => Promise<void>
  } {
    return () => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true as const, value: undefined }) }),
      dispose: () => Promise.resolve(),
    })
  }
}

/**
 * The `remote.workspaceFiles` namespace, as `RemoteNamespaceService` registers it.
 *
 * The name is the gateway's own spelling (`remote.${namespace}`) and the class is
 * mounted by its own fiber, which is the whole reason this scene exists: the
 * service is a *separate context property* from `remote`, and reading it is what
 * the consuming fiber must declare.
 */
class WorkspaceFilesService extends Service {
  /** Every listing asked of the namespace, in order. */
  readonly calls: ListCall[] = []

  constructor(ctx: Context) {
    super(ctx, 'remote.workspaceFiles')
  }

  list(sessionId: string, path: string): Promise<{ readonly ok: true, readonly value: { readonly entries: typeof ROOT_ENTRIES, readonly truncated: boolean } }> {
    this.calls.push({ sessionId, path })
    return Promise.resolve({ ok: true, value: { entries: ROOT_ENTRIES, truncated: false } })
  }

  changes(): AsyncIterable<never> {
    return { [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true as const, value: undefined }) }) }
  }
}

/** A loaded client entry over a real runtime. */
export interface ClientEntryScene {
  /** The runtime the entry was loaded into. */
  readonly ctx: Context
  /** The fiber the entry ran in, once it settled. */
  readonly fiber: { readonly state: number }
  /** Every seat the entry's features waited for. */
  readonly injectedSeats: readonly string[]
  /** Every slot registration the entry's features made. */
  readonly registrations: readonly { readonly name: string, readonly key?: string, readonly id?: string }[]
  /** Every listing that reached `remote.workspaceFiles`. */
  readonly listed: readonly ListCall[]
  /** The rendered markup of the panel as it last stood. */
  readonly lastMarkup: () => string
  /** The rendered markup of every panel render, joined; what "never shown" is read against. */
  readonly allMarkup: () => string
  /** Let the deferred docking resolve and the listing settle. */
  readonly settle: () => Promise<void>
  /** The stand-in document, so a test can inspect the page the plugin patched. */
  readonly document: FakeDom['document']
  /** Unload the entry and uninstall the stand-in globals. */
  readonly unload: () => Promise<void>
}

/** The module shape the entry exposes: the services it declares and its body. */
export interface ClientEntryModule {
  /** The service names the entry requires before it may run. */
  readonly inject: readonly string[]
  /** The entry's plugin body. */
  readonly apply: (ctx: Context) => void
}

/** The elements the panel's root was handed, keyed by the test that owns them. */
export interface RenderLog {
  /** The elements handed to every mocked root's `render`, in order. */
  readonly elements: ReactElement[]
}

/** How the scene draws one tab's body, the way the docking kit draws it. */
function drawTabBody(document: FakeDom['document'], tabId: string): void {
  const host = document.createElement('div')
  host.setAttribute('data-dockkit-host', 'dock')
  const section = document.createElement('section')
  section.setAttribute('data-dockkit-content', tabId)
  // The sidebar's body seat. The title seat is skipped by `findTabBody`, so the
  // drawn shape has to carry the body seat inside the tab's own section.
  const body = document.createElement('div')
  body.setAttribute('data-sidebar-right-tab', tabId)
  section.appendChild(body)
  host.appendChild(section)
  document.body.appendChild(host)
}

/** Flush the deferred work the docking schedules and let promises settle. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1)
    await new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Mount one host service on the runtime and hand it back.
 *
 * A `Service` subclass registers itself in its own constructor, so a caller that
 * only wants the service mounted has no assignment to make. Wrapping the
 * construction here keeps that registration visible as a value this scene uses
 * rather than an effect it performs and forgets.
 * @param ctx - the runtime to register on.
 * @param ServiceClass - the service class to construct.
 * @returns the mounted service.
 */
function mount<Instance extends Service>(ctx: Context, ServiceClass: new (ctx: Context) => Instance): Instance {
  return new ServiceClass(ctx)
}

/**
 * Load the real client entry into a real cordis runtime.
 * @param entry - the module to load: the services it declares, and its body.
 * @param log - the recorder the mocked `react-dom/client` writes elements into.
 * @returns the scene, its evidence and its unloader.
 */
export async function clientEntryScene(
  entry: ClientEntryModule,
  log: RenderLog,
): Promise<ClientEntryScene> {
  const dom = createFakeDom()
  const restore = dom.install()
  drawTabBody(dom.document, FILES_TAB_ID)

  const ctx = new Context()
  mount(ctx, LocaleService)
  const slots = mount(ctx, SlotsService)
  mount(ctx, SidebarRightTabsService)
  mount(ctx, SidebarRightService)
  mount(ctx, SessionsService)
  mount(ctx, RemoteService)

  // The gateway's own topology: each namespace is mounted under a plugin fiber of
  // its own, named after the service it provides. Registering it on the root
  // context instead would make it reachable by the fallback walk and hide the
  // gate this suite exists to pin.
  let namespace: WorkspaceFilesService | undefined
  const gateway = ctx.plugin({
    name: 'remote.workspaceFiles',
    inject: ['remote'],
    apply: (fiberCtx: Context) => {
      namespace = new WorkspaceFilesService(fiberCtx)
    },
  })
  await gateway

  const fiber = ctx.plugin({ inject: [...entry.inject], apply: entry.apply })
  await fiber
  await settle()

  return {
    ctx,
    fiber: { get state() { return fiber.state } },
    injectedSeats: slots.injected,
    registrations: slots.registrations,
    listed: namespace?.calls ?? [],
    lastMarkup: () => renderToStaticMarkup(log.elements[log.elements.length - 1]!),
    allMarkup: () => log.elements.map(element => renderToStaticMarkup(element)).join('\n---\n'),
    settle,
    document: dom.document,
    async unload() {
      await fiber.dispose()
      await gateway.dispose()
      restore()
    },
  }
}
