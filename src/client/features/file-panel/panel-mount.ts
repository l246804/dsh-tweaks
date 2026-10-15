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
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/panel-mount
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { PanelController } from './controller.ts'
import type { HostDom, PanelHost, PanelMode } from './panel-host.ts'
import type { PanelState } from './panel-state.ts'
import type { PreferenceStorage } from './preferences.ts'
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
   * @returns whether anything moved.
   */
  readonly reveal?: ((container: Node, path: string) => boolean) | undefined
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
   * reveals on the change that completes the chain or never reveals at all,
   * which is the whole point of the wait. Drawing happens either way, because
   * the view is what puts the row on screen for a reveal to find.
   */
  const reconsiderReveal = (): void => {
    const key = controller.state().active
    const decision = decideScroll({
      scrolledKey: revealedKey,
      activeKey: key,
      pending: chain === undefined || chain.length === 0 ? 0 : controller.pending(chain),
    })
    draw()
    if (decision !== 'scroll' || key === undefined)
      return
    // Remembered before the attempt, not after: a row the filter hides will not
    // appear on the next identical state change, and retrying on every render
    // would fight a reader who scrolled away in the meantime.
    revealedKey = key
    options.reveal?.(host.container(), key)
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
        controller.activate(decision.chain, decision.activeKey)
      }
      else {
        chain = undefined
        revealedKey = undefined
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
