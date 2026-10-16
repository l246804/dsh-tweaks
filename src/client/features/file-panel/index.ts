/**
 * The file panel.
 *
 * The built-in `files` tab is one tab competing with the file it opened. This
 * feature takes the `files` tab kind over with a type in the `extension` band,
 * so the built-in type steps aside, and renders **one** panel that persists
 * across every file tab: one DOM, one state, so expansion, loaded levels, the
 * filter word and the scroll offset are shared, and no directory is watched
 * twice.
 *
 * What this module does, and nothing else: register the type, install the copy,
 * build the instance, and start the agent that keeps it docked in whichever tab
 * is on screen. Every rule it applies lives in a module beside it, each one
 * testable on its own:
 *
 * | module | what it owns |
 * |---|---|
 * | `surface.ts` | where the panel belongs for a tab (page / dock / none) |
 * | `docking.ts` | noticing a tab switch, and resolving it after the render |
 * | `controller.ts` | the tree's state and one set of directory subscriptions |
 * | `panel-host.ts`, `panel-mount.ts` | one container, moved rather than rebuilt |
 * | `activation.ts`, `reveal.ts` | which file is active, and when to centre it |
 * | `open-file.ts` | what clicking a file row means |
 * | `view.ts`, `renderer.ts` | the markup, and the root that draws it |
 * | `toolbar.ts` | the file-list toggle on a file tab's toolbar |
 *
 * Two consequences of the takeover are worth stating where they are decided.
 *
 * **The type needs a new id.** The registry pairs one `builtin` with one
 * `extension` per kind, and reusing the built-in implementation's id throws. The
 * built-in type therefore resumes, untouched, if this plugin unloads.
 *
 * **The panel renders into a body this plugin does not own.** A file tab's body
 * belongs to the preview plugin, and the panel must sit inside it while being one
 * instance across all of them. That is the case ADR-0002 names as legitimate for
 * a DOM patch ("跨 tab 单一实例的面板"), and `docking.ts` states which stable
 * anchors it reads and why.
 *
 * ## Fallback nature, and what would replace the page-patching half
 *
 * Everything past the two registrations below is a DOM patch under
 * `docs/adr/0002-official-channels-first.md`: a stylesheet this plugin owns, a
 * container appended into a tab body the preview plugin renders, and an observer
 * of tab switches. Each of those names its own replacement where it is decided
 * (`tab-anchor.ts` for the anchors, `docking.ts` for the watching, `toolbar.ts`
 * for the seat it type-erases). What would delete *this* module's patch is a tab
 * definition declaring a container the kit reserves beside the tab's content, or
 * a pane-level slot the panel could register into: either would let the framework
 * render the panel instead of this plugin moving it into place by hand. At that
 * point `install` keeps the two registrations above and drops everything from
 * `hasDocument()` down.
 *
 * The seams its dependents fill in, both pure and both stable:
 * - `open-file.ts` (ticket #5): what opening a file row means;
 * - `activation.ts` (ticket #6): which file a tab shows, and when to scroll.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel
 */

import type { SidebarRightGuideEntry } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '../../contracts.ts'
import type { DockingDocument } from './docking.ts'
import type { HostDom } from './panel-host.ts'
import type { PanelMount } from './panel-mount.ts'
import { GuideArtworkFiles } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { isDockedTab } from '../../dom/dock-anchors.ts'
import { createBrowserHostDom, deferToNextTask, hasDocument, installPanelStyles } from './browser-dom.ts'
import { createPanelController } from './controller.ts'
import { createDocking } from './docking.ts'
import { EN, NS, ZH } from './locales.ts'
import { applyOpenFilePlan, planOpenFile } from './open-file.ts'
import { createPanelMount } from './panel-mount.ts'
import { createDirectoryIo } from './remote.ts'
import { createPanelRenderer } from './renderer.ts'
import { revealRow } from './reveal.ts'
import { panelStyles } from './styles.ts'
import { FILES_ID, FILES_KIND } from './surface.ts'
import { FilesPanelTitle } from './title.ts'
import { installPanelToggle } from './toolbar.ts'

/**
 * The shortcut command the guide entry names, so the capsule shows its keys.
 *
 * The command itself is registered by the built-in files plugin, which keeps
 * running after this plugin takes its tab kind over (see the comment in
 * {@link install}). Reading the id off the guide entry's own type is how the
 * guide does it, and it keeps this plugin from importing the shortcut package
 * just to spell a string it does not own.
 */
const WORKSPACE_FILES_COMMAND = 'workspace.files' as NonNullable<SidebarRightGuideEntry['commandId']>

/**
 * Install the file-panel tweak.
 *
 * Every resource goes through `ctx.effect` with a label, so unloading the plugin
 * stops every directory subscription, drops the React root, removes the
 * container, and detaches the stylesheet.
 * @param ctx - the client root context.
 */
export function install(ctx: ClientContext): void {
  const t = (): TranslateNS<typeof NS> => ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-tweaks: file-panel copy')

  // Stage one: the type. An `extension` outranks the built-in `builtin` band for
  // the same kind, which is the documented way a type from outside the product
  // takes a built-in kind over. The guide entry is the built-in one, glyph and
  // command id included (ADR-0003).
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: FILES_ID,
    kind: FILES_KIND,
    priority: 'extension',
    title: () => t()('type.label'),
    guide: [{
      id: 'workspace',
      commandId: WORKSPACE_FILES_COMMAND,
      order: 10,
      title: () => t()('guide.title'),
      description: () => t()('guide.description'),
      icon: GuideArtworkFiles,
    }],
  }), 'dsh-tweaks: file-panel tab type')

  // Stage two: the body seat, under this implementation's own id. A keyed seat
  // dispatches by the id of the type in force, so the takeover needs no
  // cooperation from the built-in plugin. The seat renders nothing: `docking.ts`
  // moves the panel's container into the tab body.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: FILES_ID },
    () => null,
  )), 'dsh-tweaks: file-panel body seat')

  // Stage three: the chip's title. The built-in type registers one and the chip
  // falls back to bare registry text without it, so taking the kind over takes
  // this over too.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: FILES_ID },
    FilesPanelTitle,
  )), 'dsh-tweaks: file-panel tab title')

  // What is deliberately *not* here: a `workspace.files` shortcut. The built-in
  // files plugin keeps running after the takeover and still registers that
  // command; the registry refuses a duplicate id, so re-registering would throw
  // during install (see ADR-0003).

  // Everything past here patches the page: a stylesheet, a container docked into a
  // tab body, and an observer for tab switches. With no document there is nothing
  // to patch, so what is registered above is the whole contribution.

  // The artifact contract check runs `apply` in exactly that state, as upstream's
  // client kernel does when `typeof document === 'undefined'`.
  if (!hasDocument())
    return

  ctx.effect(() => installPanelStyles(panelStyles()), 'dsh-tweaks: file-panel styles')

  const panel = createDockedPanel(ctx, { dom: createBrowserHostDom(), document })
  ctx.effect(() => () => {
    panel.dispose()
  }, 'dsh-tweaks: file-panel instance')

  ctx.effect(
    () => installPanelToggle(ctx.slots, { mount: panel.mount, t }),
    'dsh-tweaks: file-panel toolbar toggle',
  )
}

/** The page a docked panel is built over. */
interface DockedPanelOptions {
  /** The DOM operations the container is created, marked and moved through. */
  readonly dom: HostDom<Element>
  /** The document whose tab bodies the panel docks into. */
  readonly document: DockingDocument
}

/** What {@link createDockedPanel} builds. */
interface DockedPanel {
  /** The panel instance, which the toolbar control reads and writes. */
  readonly mount: PanelMount<Element>
  /** Unload everything this panel owns: the root, the container and the agent. */
  readonly dispose: () => void
}

/**
 * Build the panel: its state, its renderer, its DOM face, and the agent that
 * keeps it docked in whichever tab is on screen.
 * @param ctx - the client root context.
 * @param options - the DOM face to build over and the document to observe.
 * @returns the panel and its disposer.
 */
function createDockedPanel(
  ctx: ClientContext,
  options: DockedPanelOptions,
): DockedPanel {
  const t = (): TranslateNS<typeof NS> => ctx.locale.bind(NS)
  const controller = createPanelController(createDirectoryIo(ctx.remote))

  // The renderer is built before the mount, and one of its callbacks has to
  // reach the mount: the scroller exists only after React commits, which is when
  // a reveal becomes possible. The holder keeps that one-directional, so the
  // renderer learns nothing about the mount.
  let mount: PanelMount<Element> | undefined

  const renderer = createPanelRenderer({
    t,
    onToggle: (path) => { controller.toggle(path) },
    onOpen: (path) => { openRow(ctx, controller.state().root, path) },
    onFilter: (filter) => { controller.setFilter(filter) },
    onReload: () => { controller.reload() },
    onScroll: (scrollTop) => { controller.setScroll(scrollTop) },
    scrollTop: () => controller.state().scrollTop,
    // The scroller arriving *is* the commit signal: it is the element the tree
    // was drawn into, so it can only run after the rows exist. `revealRow` finds
    // the scroller from its own marker, so there is nothing to hand over here.
    onScroller: () => { mount?.onRendered() },
  })

  mount = createPanelMount<Element>({
    dom: options.dom,
    controller,
    render: renderer.render,
    reveal: (container, path) => revealRow(container, path),
  })

  const docking = createDocking({
    document: options.document,
    facts: {
      onScreenSession: () => ctx.sidebarRight.mounted.getSnapshot(),
      activeTab: () => ctx.sidebarRight.active(),
      workspaceRootOf: sessionId => ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd,
    },
    inventory: ctx.sidebarRight.openTabs,
    onScreen: ctx.sidebarRight.mounted,
    defer: (work) => { deferToNextTask(work) },
    place(target, element) {
      if (target === undefined || element === undefined) {
        // Nothing on screen to dock beside: off the page, with every byte of
        // state and every subscription left exactly where they are.
        mount.show({ sessionId: undefined, workspaceRoot: undefined, address: undefined, kind: undefined })
        return
      }
      mount.show({
        sessionId: target.sessionId,
        workspaceRoot: target.workspaceRoot,
        address: target.address,
        kind: target.kind,
      })
      mount.dockInto(element, target.kind === FILES_KIND ? 'page' : 'dock')
    },
  })

  return {
    mount,
    dispose: () => {
      docking.dispose()
      renderer.dispose()
      mount.dispose()
    },
  }
}

/**
 * Open one file row.
 *
 * The decision is `open-file.ts`'s, so ticket #5 can change it without touching
 * this module: this only assembles the four facts it takes and runs the plan
 * through the sidebar.
 *
 * The facts that are not obvious:
 * - **The acting tab is docked whenever it has a slot to lend.** A docked tab's
 *   address is the tab's own place; a floating one holds one tab and lends
 *   nothing, which `planOpenFile` handles by degrading to a plain open.
 * - **Only the file-list page may be replaced.** The panel is one instance in two
 *   homes, and a row clicked in the docked home is a row read *beside* a file the
 *   reader is looking at: replacing that tab would take the file away in the act
 *   of opening another. `currentIsFilesPage` is what tells the two homes apart,
 *   and it is read from the tab's own kind rather than from the panel's mode,
 *   because the mode is this plugin's rendering choice and the kind is the host's
 *   record.
 * - **`canClose` is answered permissively on purpose.** The host refuses a close
 *   silently rather than reporting it, and the one tab it refuses is a sole
 *   docked guide, which is never the tab a file row is clicked from. A refusal
 *   would therefore only ever be a no-op, so the plan does not need to predict it.
 * @param ctx - the client root context.
 * @param root - the workspace root, or undefined when the session has none.
 * @param path - the file's absolute path.
 */
function openRow(ctx: ClientContext, root: string | undefined, path: string): void {
  const sessionId = ctx.sidebarRight.mounted.getSnapshot()
  if (root === undefined || sessionId === undefined)
    return
  const current = ctx.sidebarRight.active()
  // The host's own builder, which strips the workspace root off an absolute
  // tree-row path; the same one the built-in tree opened rows with.
  const address = fileAddressFor(sessionId, root, path)
  const plan = planOpenFile({
    address,
    current,
    open: ctx.sidebarRight.tabsIn(sessionId),
    canClose: () => true,
    currentDocked: isDocked(current?.id),
    currentIsFilesPage: current?.kind === FILES_KIND,
  })
  applyOpenFilePlan({
    openResource: (target, options) => {
      // A file row is always in the tab the reader is looking at, so the
      // session-qualified path is the right one: it acts on the session the tab
      // is in rather than on whatever is on screen by the time this runs.
      ctx.sidebarRight.openResourceIn(sessionId, target, options)
    },
    focus: (tabId) => { ctx.sidebarRight.focus(tabId) },
    close: (tabId) => { ctx.sidebarRight.closeIn(sessionId, tabId) },
  }, plan)
}

/**
 * Whether a tab sits in a docked pane, which is what makes it able to lend a slot.
 *
 * The answer is read from the DOM because the layout record is not part of the
 * public sidebar face, and it is read through `dom/dock-anchors.ts` so the file
 * panel and the tab actions share one reading of the kit's anchors rather than
 * each spelling the attributes out. A tab the shell has not rendered has no
 * host, which that module answers `false`: the conservative answer, since the
 * fallback is a plain open.
 * @param tabId - the tab's id, or undefined when no tab is active.
 * @returns whether the tab is docked.
 */
function isDocked(tabId: string | undefined): boolean {
  if (tabId === undefined)
    return false
  return isDockedTab(document, tabId)
}
