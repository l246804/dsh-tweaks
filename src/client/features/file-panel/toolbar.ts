/**
 * The file-list toggle, contributed to a file tab's toolbar.
 *
 * Where the control belongs: on the **document toolbar**, the 38px row the
 * preview renders under a tab's strip. That row is the file tab's own toolbar,
 * and the toggle means something about the tab's content, which is exactly what
 * the seat is for.
 *
 * Why this file has to be written the awkward way. The seat is declared by
 * `ui-sidebar-documentpreview`, a package this plugin must not import: it is not
 * a row of the shell's module table, so importing it for value would inline a
 * second copy of another plugin's runtime identity, and the build's purity gate
 * rejects that outright. The consequence is that the seat's *type* augmentation
 * is not in this program, while the seat itself very much exists at runtime.
 *
 * So the registration is type-erased here, once, with the reason stated: the key
 * is a string the host resolves, the framework is being used exactly as designed,
 * and `ctx.slots.inject` is the safe direction of the mismatch: a key nothing
 * declares simply never fires its callback, so this degrades to "no toolbar entry"
 * rather than throwing during install if the preview plugin is not mounted.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/toolbar
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { PanelMount } from './panel-mount.ts'
import { IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement, useSyncExternalStore } from 'react'

/** The document toolbar seat, as `ui-sidebar-documentpreview` declares it. */
const DOCUMENT_ACTIONS_SEAT = 'sidebar.right.tab.document.actions'

/**
 * The part of the slot registry this registration uses, named structurally.
 *
 * Declared here rather than imported because the seat belongs to a package this
 * plugin may not depend on (see the module doc). Both members are the framework's
 * own signatures, narrowed to the two calls made below.
 */
/** How one list entry names itself to the registry: the seat, its own id, and its copy. */
interface ListEntryIdentity {
  /** The seat the entry is contributed to. */
  readonly name: string
  /** The entry's own identity within that seat's list. */
  readonly id: string
  /** The copy namespace its component's strings come from. */
  readonly locale: string
}

interface DynamicSlots {
  /**
   * Install an effect for each declaration lifetime of a slot.
   * @param key - the declared slot key.
   * @param callback - creates the contribution once the key is declared.
   * @returns the disposer.
   */
  readonly inject: (key: string, callback: () => () => void) => () => void
  /**
   * Register one list entry.
   * @param options - the entry's identity.
   * @param component - the entry's renderer.
   * @returns the disposer.
   */
  readonly register: (options: ListEntryIdentity, component: () => ReactNode) => () => void
}

/** What the toggle needs to read and write. */
export interface ToggleOptions {
  /** The panel instance whose visibility the toggle controls. */
  readonly mount: Pick<PanelMount<Element>, 'enabled' | 'setEnabled' | 'subscribe'>
  /** The bound translate function, read fresh so a language switch is picked up. */
  readonly t: () => TranslateNS<'dshTweaksFiles'>
}

/**
 * Render the toggle.
 *
 * The pressed state is read through the panel's own subscription, so the chip is
 * correct no matter what changed the preference, whether this control or a restored
 * session.
 * @param options - the panel and the copy.
 * @returns the toggle button.
 */
function ToggleButton(options: ToggleOptions): ReactNode {
  const enabled = useSyncExternalStore(options.mount.subscribe, options.mount.enabled, options.mount.enabled)
  const t = options.t()
  return createElement('button', {
    'type': 'button',
    // The host's own toolbar classes carry a build hash and are not knowable
    // here; the attribute is what a reader can find and a test can assert.
    'data-dsh-tweaks-files-panel-toggle': '',
    'aria-pressed': enabled,
    'aria-label': t('panel.aria'),
    'title': enabled ? t('panel.hide') : t('panel.show'),
    'onClick': () => { options.mount.setEnabled(!enabled) },
  }, createElement(IconWorkspaceTreeOutlineRegular, { size: 15 }))
}

/**
 * Contribute the toggle to a file tab's document toolbar.
 *
 * @param slots - the slot registry, used through the structural face above.
 * @param options - the panel and the copy.
 * @returns a disposer that removes the contribution.
 */
export function installPanelToggle(slots: unknown, options: ToggleOptions): () => void {
  const registry = slots as DynamicSlots
  // `inject` is the whole reason this is safe: the callback runs only if some
  // mounted plugin declares the seat, so an absent preview plugin is a no-op
  // rather than a failed install.
  return registry.inject(DOCUMENT_ACTIONS_SEAT, () => registry.register(
    { name: DOCUMENT_ACTIONS_SEAT, id: 'dsh-tweaks:file-panel-toggle', locale: 'dshTweaksFiles' },
    () => ToggleButton(options),
  ))
}
