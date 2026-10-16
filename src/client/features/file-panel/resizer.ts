/**
 * The panel's width: the arithmetic, and the one element that carries it.
 *
 * The panel is a column with a seam down its left edge, and a reader drags that
 * seam. Three numbers decide everything, and all three are arithmetic:
 *
 * - the **proposal**, which is the width the drag has asked for so far: the
 *   width it started at, plus how far the pointer has moved left (the seam is
 *   the panel's left edge, so leftwards is wider);
 * - the **bounds**, which are `preferences.ts`'s, not this module's: it owns the
 *   floor, the "half the host" ceiling and the fallback, so the range a reader
 *   can drag within has one definition;
 * - the **reset**, a double click on the seam, which goes back to the default
 *   width rather than to whatever the pointer happened to leave behind. In a
 *   pane too narrow for the default twice it stops at the ceiling instead;
 *   `resetWidth` answers through the same bounds as everything else.
 *
 * The arithmetic is separated from the document on purpose. A drag is a stream
 * of pointer positions, and the only interesting question about it ("given
 * where the pointer is, how wide is the panel?") is a subtraction and a clamp,
 * so it is a function over numbers and is checked without a browser. What stays
 * in the binding is measurement and assignment, which the eye checks and no test
 * pretends to.
 *
 * Three details of the binding are worth stating:
 *
 * - **The width is written to the panel's container, not to the handle.** The
 *   container is the one node the panel owns for its whole life and the element
 *   the stylesheet's `var()` fallback is declared on; the handle is re-created by
 *   every render. A custom property set on the container is what the stylesheet's
 *   `width: var(…)` reads, so a resize survives the next draw.
 * - **The stored value is the proposal, not the applied width.** A drag that
 *   stops at the ceiling because the window is narrow should not persist that
 *   constrained width as the reader's choice; `writeWidthPreference` states the
 *   same rule from the other side. The *applied* width is always the clamped one.
 * - **The drag lives in this module, keyed by the handle element.** A render may
 *   replace the handle mid-gesture; the pointer stream is not the view's to keep.
 *
 * The gesture's shape is the trajectory panel's details handle
 * (`ui-trajectory/src/client/TrajectoryTable.tsx:2956-3012`): a
 * `role="separator"` box that captures the pointer, resets on a double click and
 * steps with the arrow keys. Its appearance is the docking kit's divider
 * (`ui-dockkit/src/components/dockkit.module.css`): a zero-width box whose
 * pseudo-elements draw the hairline and widen the hit target to 8px.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/resizer
 */

import type { PreferenceStorage } from './preferences.ts'
import { PANEL_CONTAINER_ATTRIBUTE } from './panel-host.ts'
import {
  browserStorage,
  clampPanelWidth,
  PANEL_DEFAULT_WIDTH,
  readWidthPreference,
  writeWidthPreference,
} from './preferences.ts'
import { PANEL_WIDTH_VARIABLE } from './styles.ts'

/** Marks the drag handle, so the stylesheet and the view can name it without a hashed class. */
export const PANEL_RESIZER_ATTRIBUTE = 'data-dsh-tweaks-file-panel-resizer'

/** How far one arrow-key press moves the seam. The trajectory panel's details handle uses the same step. */
export const PANEL_RESIZE_STEP = 16

/** What one drag remembers for as long as it lasts. */
export interface ResizeDrag {
  /** The pointer the drag belongs to, so a second pointer cannot steer it. */
  readonly pointerId: number
  /** Where the pointer was when the drag began. */
  readonly startX: number
  /** The panel's width when the drag began. */
  readonly startWidth: number
  /** The host's width when the drag began, so a mid-drag reflow cannot resize the bounds under it. */
  readonly hostWidth: number
  /** The last width the drag proposed, before the bounds had their say. */
  readonly proposed: number
}

/**
 * The width one drag asks for at a given pointer position, inside its bounds.
 *
 * The seam is the panel's left edge, so the deltas are inverted: a pointer that
 * moved 40px left asks for a panel 40px wider. The bounds are applied here
 * rather than at the assignment, so "how wide is the panel" has one answer and an
 * out-of-range proposal is never a width anything sees.
 * @param drag - the drag in progress.
 * @param clientX - the pointer's horizontal position.
 * @returns the width to apply.
 */
export function draggedWidth(drag: ResizeDrag, clientX: number): number {
  return clampPanelWidth(proposedWidth(drag, clientX), drag.hostWidth)
}

/**
 * The width one drag asks for, before the bounds had their say.
 *
 * Exported because it is the whole geometry of the gesture and nothing else, so
 * a test can pin the sign of the delta without also asserting the bounds.
 * @param drag - the drag in progress.
 * @param clientX - the pointer's horizontal position.
 * @returns the unclamped width.
 */
export function proposedWidth(drag: ResizeDrag, clientX: number): number {
  return drag.startWidth + drag.startX - clientX
}

/**
 * The width one arrow-key press asks for, inside the bounds.
 *
 * Left widens and right narrows, matching the direction the seam itself moves,
 * which is the mapping the trajectory panel's details handle uses too. The
 * bounds are applied here, so a step is never a width the stylesheet would
 * contradict. Any other key is not this control's: `undefined` says so, and the
 * caller then leaves the event alone for whatever handles it next.
 * @param current - the panel's width now.
 * @param key - the key that was pressed.
 * @param hostWidth - the host's width in pixels, or 0 when it is not measured.
 * @returns the width to apply, or undefined for a key this control does not use.
 */
export function steppedWidth(current: number, key: string, hostWidth: number): number | undefined {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight')
    return undefined
  const direction = key === 'ArrowLeft' ? 1 : -1
  return clampPanelWidth(current + direction * PANEL_RESIZE_STEP, hostWidth)
}

/**
 * The width a double click asks for, inside the bounds.
 *
 * The default, unless the host is too narrow for the default twice, and then the
 * ceiling: the reset must respect the one bound the panel may never cross.
 * Going through the clamp rather than returning the default outright is what
 * makes that edge a fact of the bounds rather than a special case here.
 * @param hostWidth - the host's width in pixels, or 0 when it is not measured.
 * @returns the width to apply.
 */
export function resetWidth(hostWidth: number): number {
  return clampPanelWidth(PANEL_DEFAULT_WIDTH, hostWidth)
}

/**
 * The pointer facts one drag reads. Structurally satisfied by React's own
 * `PointerEvent`.
 *
 * Not exported, in the same spirit as `panel-host.ts`'s `PanelLocation`: it
 * describes an argument to this module's own handlers, and no other module has a
 * reason to spell the shape out. A test that needs one writes the object it
 * means, which the structural type then accepts or rejects on its merits.
 */
interface ResizePointerEvent {
  /** The pointer's id, which is what pointer capture is granted for. */
  readonly pointerId: number
  /** The pointer's horizontal position. */
  readonly clientX: number
  /** The mouse button, where the device has one. */
  readonly button: number
  /** The handle the event was delivered to. */
  readonly currentTarget: HTMLElement
  /** Suppress the text selection a drag would otherwise start. */
  readonly preventDefault: () => void
}

/** The key facts one step reads. Structurally satisfied by React's own `KeyboardEvent`. */
interface ResizeKeyEvent {
  /** The key that was pressed. */
  readonly key: string
  /** The handle the event was delivered to. */
  readonly currentTarget: HTMLElement
  /** Stop the arrow key from also scrolling the tree. */
  readonly preventDefault: () => void
}

/**
 * The live drags, keyed by the handle that owns each.
 *
 * Module-level rather than per-view so a handle re-created by a render does not
 * lose a gesture in progress, and so the view stays a description of what is on
 * screen with no state of its own. A `WeakMap` because a handle that leaves the
 * page takes its (at most one) drag with it.
 */
const drags = new WeakMap<HTMLElement, ResizeDrag>()

/** The panel's container for a handle: the element the width is written to. */
function containerOf(handle: HTMLElement): HTMLElement | null {
  return handle.closest<HTMLElement>(`[${PANEL_CONTAINER_ATTRIBUTE}]`)
}

/**
 * The host's width: the box the panel shares.
 *
 * The container's parent is that box in both shapes the panel docks in (the
 * preview's root, or a tab body when the preview is not the host), and 0 means
 * "not measured", which `clampPanelWidth` reads as "the floor only".
 * @param handle - the drag handle.
 * @returns the host's width in pixels, or 0 when there is nothing to measure.
 */
function hostWidthOf(handle: HTMLElement): number {
  const host = containerOf(handle)?.parentElement
  if (host === null || host === undefined)
    return 0
  return host.getBoundingClientRect().width
}

/** The panel's width as it is laid out now, which is where a drag and a step start from. */
function currentWidthOf(handle: HTMLElement): number {
  const measured = containerOf(handle)?.getBoundingClientRect().width ?? 0
  return measured > 0 ? measured : PANEL_DEFAULT_WIDTH
}

/** Give the panel a width: the custom property the stylesheet's `var()` reads. */
function applyWidth(handle: HTMLElement, width: number): void {
  containerOf(handle)?.style.setProperty(PANEL_WIDTH_VARIABLE, `${width}px`)
}

/** What one bound handle reads and writes. */
export interface PanelResizer {
  /**
   * Apply the remembered width.
   *
   * Called from the handle's own commit ref, which is the first moment the
   * container exists to write to and the last moment before the panel is
   * painted at its fallback width.
   * @param element - the handle, or null while it is unmounted.
   */
  readonly onReady: (element: HTMLElement | null) => void
  /**
   * Start a drag.
   * @param event - the pointer event.
   */
  readonly onPointerDown: (event: ResizePointerEvent) => void
  /**
   * Steer a drag this pointer owns.
   * @param event - the pointer event.
   */
  readonly onPointerMove: (event: ResizePointerEvent) => void
  /**
   * Finish a drag, remembering the width it proposed.
   * @param event - the pointer event.
   */
  readonly onPointerUp: (event: ResizePointerEvent) => void
  /**
   * Drop a drag the browser took away.
   * @param event - the pointer event.
   */
  readonly onPointerCancel: (event: ResizePointerEvent) => void
  /**
   * Put the seam back where it starts.
   * @param event - the double-click event.
   */
  readonly onDoubleClick: (event: ResizePointerEvent) => void
  /**
   * Step the seam with the arrow keys.
   * @param event - the key event.
   */
  readonly onKeyDown: (event: ResizeKeyEvent) => void
}

/**
 * Build the panel's resize gesture.
 *
 * The returned handlers are the handle's whole behaviour; the markup carrying
 * them is `view.ts`'s. Nothing here is captured per render except the drag in
 * progress, which lives in {@link drags} keyed by the element itself.
 * @param options - where the width preference lives; defaults to the browser's own storage.
 * @param options.storage - an explicit store, for a caller that has one.
 * @returns the gesture's handlers.
 */
export function createPanelResizer(options: { readonly storage?: PreferenceStorage | undefined } = {}): PanelResizer {
  // Resolved once, on the first gesture rather than at construction: building
  // this during install must not touch storage before the plugin is loaded.
  let storage: PreferenceStorage | undefined
  let resolved = false
  const storageOf = (): PreferenceStorage | undefined => {
    if (!resolved) {
      storage = options.storage ?? browserStorage()
      resolved = true
    }
    return storage
  }

  /**
   * Answer one gesture: apply the width its request earns inside the bounds, and
   * remember the request itself.
   *
   * The two halves are separate on purpose. What the reader sees is always the
   * clamped width, because a panel past half its host is the failure the bound
   * exists to prevent. What is stored is the request, because a window that was
   * narrow for one gesture should not overwrite the reader's choice with the
   * ceiling it forced; `writeWidthPreference` says the same from the other side.
   */
  const settle = (handle: HTMLElement, request: number): void => {
    applyWidth(handle, clampPanelWidth(request, hostWidthOf(handle)))
    writeWidthPreference(storageOf(), request)
  }

  return {
    onReady(element) {
      if (element === null)
        return
      // Clamped against the host here rather than left to `readWidthPreference`,
      // which guarantees only the floor: the gridded dock sizes the panel's
      // column to the panel, so a stored width past the ceiling has no other
      // bound to run into. This is the first moment the host can be measured.
      applyWidth(element, clampPanelWidth(readWidthPreference(storageOf()), hostWidthOf(element)))
    },
    onPointerDown(event) {
      // A secondary button is a context menu, not a drag.
      if (event.button !== 0)
        return
      const handle = event.currentTarget
      const startWidth = currentWidthOf(handle)
      drags.set(handle, {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth,
        hostWidth: hostWidthOf(handle),
        proposed: startWidth,
      })
      handle.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    onPointerMove(event) {
      const handle = event.currentTarget
      const drag = drags.get(handle)
      if (drag === undefined || drag.pointerId !== event.pointerId)
        return
      drags.set(handle, { ...drag, proposed: proposedWidth(drag, event.clientX) })
      applyWidth(handle, draggedWidth(drag, event.clientX))
    },
    onPointerUp(event) {
      const handle = event.currentTarget
      const drag = drags.get(handle)
      if (drag === undefined || drag.pointerId !== event.pointerId)
        return
      drags.delete(handle)
      handle.releasePointerCapture(event.pointerId)
      // The proposal rather than the applied width, for the reason the module
      // note gives: a narrow window must not become the reader's preference.
      writeWidthPreference(storageOf(), drag.proposed)
    },
    onPointerCancel(event) {
      const handle = event.currentTarget
      if (drags.get(handle)?.pointerId !== event.pointerId)
        return
      drags.delete(handle)
    },
    onDoubleClick(event) {
      const handle = event.currentTarget
      settle(handle, resetWidth(hostWidthOf(handle)))
      event.preventDefault()
    },
    onKeyDown(event) {
      const handle = event.currentTarget
      const next = steppedWidth(currentWidthOf(handle), event.key, hostWidthOf(handle))
      if (next === undefined)
        return
      settle(handle, next)
      event.preventDefault()
    },
  }
}
