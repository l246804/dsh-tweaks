/**
 * The panel instance: one tree, one state, docked into whichever tab is on
 * screen, for the whole life of the plugin.
 *
 * This is the module that makes "global single instance" true rather than
 * aspirational. It owns exactly three things: the DOM face (one container), the
 * controller (one state and one set of directory subscriptions) and the
 * renderer; and the only operation a tab switch performs is *docking the same
 * container somewhere else*. Nothing here is per-tab: no key, no map, no cache
 * keyed by tab id, so a second tree cannot appear even by accident.
 *
 * The rules it follows all come from the pure seams, which is what keeps this
 * file free of branching worth testing on its own:
 *
 * - `surface.ts` says where the panel belongs for the tab on screen;
 * - `activation.ts` says which file is active, and when a scroll is legitimate;
 * - `reveal.ts` says where the scroll lands;
 * - `open-file.ts` says what clicking a row does.
 *
 * The renderer arrives as a function over `(container, view)`. React, the one
 * part of this feature that needs the host's module table, therefore stays out
 * of the instance's logic, and a plain Node test can drive a whole tab switch, an
 * activation and an unload while watching the container's identity.
 *
 * That same seam is where the reveal's timing comes from. What `render` performs
 * is a *request*: with React 18's `createRoot`, the rows appear when the commit
 * runs, which is after `render` has returned. A reveal issued from
 * `reconsiderReveal` would therefore search a container that does not hold the
 * row yet, find nothing, and (because the key is remembered when the reveal is
 * attempted) never try again. So the mount splits the decision from the attempt:
 * the decision records the key, and {@link PanelMount.onRendered} runs the reveal
 * at the one moment the row exists.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/panel-mount
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { PanelController } from './controller.ts'
import type { HostDom, PanelHost, PanelMode } from './panel-host.ts'
import type { PanelState } from './panel-state.ts'
import type { PreferenceStorage } from './preferences.ts'
import type { RevealOutcome } from './reveal.ts'
import type { SurfaceDecision } from './surface.ts'
import { decideScroll } from './activation.ts'
import { createPanelHost } from './panel-host.ts'
import { browserStorage, readVisiblePreference, writeVisiblePreference } from './preferences.ts'
import { decideSurface, modeOf } from './surface.ts'

/** What the panel draws for one state; the renderer's input. */
export interface PanelView {
  /** The controller's whole state, so the renderer can draw the tree it holds. */
  readonly state: PanelState
  /** Whether the panel is docked beside a file (true) or is the whole tab (false). */
  readonly docked: boolean
}

/** A renderer: draws one view into a container, replacing whatever was there. */
export type PanelRenderer<Node> = (container: Node, view: PanelView) => void

/** What the mount needs beyond its DOM and Remote faces. */
export interface PanelMountOptions<Node> {
  /** The DOM operations to work through. */
  readonly dom: HostDom<Node>
  /** The controller that owns the state and the directory subscriptions. */
  readonly controller: PanelController
  /** Draws the view; called on every state change. */
  readonly render: PanelRenderer<Node>
  /**
   * Bring one row to the middle of the panel's scroller.
   *
   * Injected rather than done here because it is the one operation that needs a
   * laid-out document: the browser supplies the real one (`reveal.ts`'s
   * `revealRow`), and a test supplies one that reports whether it was asked. The
   * decision* to reveal is the mount's, and that is the part with the timing
   * rules worth pinning.
   * @param container - the panel's container element.
   * @param path - the absolute path of the row to centre.
   * @returns what the attempt found and did; `absent` means "try again later".
   */
  readonly reveal?: ((container: Node, path: string) => RevealOutcome) | undefined
  /** Where the visibility preference is remembered; defaults to the browser's own storage. */
  readonly storage?: PreferenceStorage | undefined
}

/** The tab on screen, as the mount hears about it. */
interface PanelShowInput {
  /** The session the tab belongs to, or undefined when none is selected. */
  readonly sessionId: SessionId | undefined
  /** The session's workspace root, or undefined when it has none. */
  readonly workspaceRoot: string | undefined
  /** The address the tab navigated to, or undefined when no tab is on screen. */
  readonly address: string | undefined
  /** The tab's kind. */
  readonly kind: string | undefined
}

/** The panel instance. */
export interface PanelMount<Node> {
  /** The tab body the panel is docked in, or undefined while it is off the page. */
  readonly host: () => Node | undefined
  /** The panel's own container: one node for this instance's whole life. */
  readonly container: () => Node
  /**
   * Tell the panel which tab is on screen. Cheap and idempotent: the same tab
   * does nothing, and a different one docks the same container there.
   * @param input - the tab's address and kind, the session, and the workspace root.
   */
  readonly show: (input: PanelShowInput) => void
  /**
   * Report that the renderer's last draw has been committed.
   *
   * The renderer calls this from the container ref, i.e. inside React's commit
   * phase, when the rows the last view described are in the DOM and can be
   * measured. It is what makes a deferred reveal land: see the module note on
   * why the attempt cannot happen where the decision is made.
   */
  readonly onRendered: () => void
  /**
   * Offer the shell's tab body element as a home for the panel.
   *
   * Called from the rendered tab body. If the tab on screen is one the panel
   * belongs in, the container moves into this element; otherwise the offer is
   * remembered for when it is.
   * @param element - the tab body element.
   * @param mode - how the panel sits there.
   */
  readonly dockInto: (element: Node, mode: PanelMode) => void
  /**
   * Whether the file panel is shown beside a file's content.
   * @returns the current value.
   */
  readonly enabled: () => boolean
  /**
   * Subscribe to the state the panel draws.
   *
   * The host's `useSyncExternalStore` pair with {@link PanelMount.enabled}: a
   * toolbar control living outside the panel's own React root needs the same
   * notifications that root gets.
   * @param listener - called after every change.
   * @returns the unsubscribe function.
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Show or hide the file panel, remembering the choice.
   * @param enabled - the new value.
   */
  readonly setEnabled: (enabled: boolean) => void
  /** Undock, drop the container, cancel every subscription and clear every marker. */
  readonly dispose: () => void
}

/**
 * Create the panel instance.
 * @param options - the DOM face, the controller, the renderer and the storage.
 * @returns the instance.
 */
export function createPanelMount<Node>(options: PanelMountOptions<Node>): PanelMount<Node> {
  const { dom, controller, render } = options
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const host: PanelHost<Node> = createPanelHost(dom)

  /** The tab body the shell last offered, which is where a dock lands. */
  let offered: { element: Node, mode: PanelMode } | undefined
  /** The tab on screen as the shell last reported it, so a repeat is a no-op. */
  let surface: SurfaceDecision | undefined
  /** The session the current surface belongs to, so a session swap is not mistaken for a repeat. */
  let surfaceSession: SessionId | undefined
  /** The key the panel last revealed; `undefined` means "nothing revealed yet". */
  let revealedKey: string | undefined
  /** The key a decision asked to reveal, waiting for the renderer to commit it. */
  let pendingReveal: string | undefined
  /** The chain of the activation being revealed, so a later state change can finish it. */
  let chain: readonly string[] | undefined
  /** The last tab the shell reported, so toggling visibility can re-decide without a new report. */
  let lastInput: PanelShowInput | undefined

  controller.setEnabled(readVisiblePreference(storage))

  /** Draw the current state, with the docked flag the host knows. */
  const draw = (): void => {
    render(host.container(), {
      state: controller.state(),
      docked: host.location()?.mode === 'dock',
    })
  }

  /**
   * Bring the active row to the middle, if this is the moment for it.
   *
   * Re-decided on every state change instead of scheduled: `activation.ts`
   * answers `wait` while any directory of the chain lacks rows, so this either
   * decides to reveal on the change that completes the chain or never decides at
   * all, which is the whole point of the wait. Drawing happens either way,
   * because the view is what puts the row on screen for a reveal to find.
   *
   * The reveal itself is *recorded*, not run: the draw below is a request to the
   * renderer, and the row it describes is not in the DOM until that render
   * commits. {@link revealPending} is the other half, and the recording happens
   * before the draw so that a renderer which commits synchronously (the shape a
   * plain stub has) reaches it in its own commit callback.
   */
  const reconsiderReveal = (): void => {
    const key = controller.state().active
    const decision = decideScroll({
      scrolledKey: revealedKey,
      activeKey: key,
      pending: chain === undefined || chain.length === 0 ? 0 : controller.pending(chain),
    })
    if (decision === 'scroll' && key !== undefined)
      pendingReveal = key
    draw()
  }

  /**
   * Run the reveal a decision asked for, now that the renderer has committed.
   *
   * `revealedKey` is set once the row was really found, moved or already centred
   * (`centred` and `settled` alike), so an attempt that found nothing (the row
   * the filter hides, or a commit that arrived before the rows did) leaves the
   * request standing and is retried on the next commit instead of being written
   * off. That is the fix for the tab-switch case: the commit that finally carries
   * the rows is the one that reveals.
   *
   * A panel that is off the page, or filling a tab on its own, has nothing to
   * centre, so the request is kept rather than dropped: it runs on the next
   * commit after the panel is docked again.
   */
  const revealPending = (): void => {
    const key = pendingReveal
    if (key === undefined || host.location()?.mode !== 'dock')
      return
    if (options.reveal?.(host.container(), key) === 'absent')
      return
    // Found and handled: the request is spent. Leaving it in place would re-run
    // the reveal on every later commit, which is exactly the "fights the reader"
    // failure the reveal memory exists to prevent.
    pendingReveal = undefined
    revealedKey = key
  }

  const unsubscribe = controller.subscribe(reconsiderReveal)

  /**
   * Decide and carry out one tab report.
   *
   * `show` and `setEnabled` are the only two reasons a placement can change, and
   * both go through here, so "where does the panel go" has exactly one answer.
   * The three inputs a placement cannot see on its own (a hidden panel, a tab the
   * shell has not rendered a body for, and a repeated report of the same tab)
   * are handled in that order, each by doing less than the case above it.
   */
  const apply = (input: PanelShowInput): void => {
    const decision = decideSurface({
      address: input.address,
      kind: input.kind,
      workspaceRoot: input.workspaceRoot,
    })
    const sessionChanged = input.sessionId !== surfaceSession
    // The session and root are the controller's, and they are what a listing
    // call needs; a change there re-reads the tree from the new root.
    controller.setTarget(input.sessionId, input.workspaceRoot)
    const repeat = !sessionChanged && sameSurface(surface, decision)
    surface = decision
    surfaceSession = input.sessionId
    if (!repeat) {
      if (decision.kind === 'dock') {
        chain = decision.chain
        // A new activation target: the same file in another session is another
        // row, so the reveal memory starts over.
        revealedKey = undefined
        pendingReveal = undefined
        controller.activate(decision.chain, decision.activeKey)
      }
      else {
        chain = undefined
        revealedKey = undefined
        // No activation is being revealed any more, so a request left over from
        // the tab that was on screen must not run against this one.
        pendingReveal = undefined
        controller.activate([], undefined)
      }
    }
    // Hidden, or a tab the panel has no home in: off the page. The container,
    // its state and every subscription stay exactly where they are, which is
    // what makes showing it again lossless.
    const mode = controller.state().enabled ? modeOf(decision) : undefined
    if (mode === undefined || offered === undefined) {
      host.detach()
      draw()
      return
    }
    host.attach(offered.element, mode)
    if (decision.kind === 'dock')
      reconsiderReveal()
    else
      draw()
  }

  return {
    host: () => host.location()?.host,
    container: () => host.container(),
    show(input) {
      lastInput = input
      apply(input)
    },
    onRendered: revealPending,
    dockInto(element, mode) {
      offered = { element, mode }
      if (lastInput === undefined)
        return
      // Re-decide with the new offer: `apply` is the one place that knows
      // whether this tab is one the panel belongs in.
      apply(lastInput)
    },
    enabled: () => controller.state().enabled,
    subscribe(listener) {
      // The controller's own subscription is exactly "something the panel draws
      // changed", which is what an outside control needs to hear.
      return controller.subscribe(listener)
    },
    setEnabled(enabled) {
      controller.setEnabled(enabled)
      writeVisiblePreference(storage, enabled)
      if (lastInput === undefined)
        draw()
      else
        apply(lastInput)
    },
    dispose() {
      unsubscribe()
      controller.dispose()
      host.dispose()
      offered = undefined
      surface = undefined
      surfaceSession = undefined
      chain = undefined
      revealedKey = undefined
      pendingReveal = undefined
      lastInput = undefined
    },
  }
}

/** Whether two decisions describe the same placement and the same activation. */
function sameSurface(left: SurfaceDecision | undefined, right: SurfaceDecision): boolean {
  if (left === undefined || left.kind !== right.kind)
    return false
  if (left.kind !== 'dock' || right.kind !== 'dock')
    return true
  return left.activeKey === right.activeKey
}
