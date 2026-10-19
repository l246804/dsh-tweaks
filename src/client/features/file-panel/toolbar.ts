/**
 * The file-list toggle, contributed to a file tab's toolbar.
 *
 * Where the control belongs: on the **document toolbar**, the 38px row the
 * preview renders under a tab's strip. That row is the file tab's own toolbar,
 * and the toggle means something about the tab's content, which is exactly what
 * the seat is for.
 *
 * ## How the seat is named
 *
 * `sidebar.right.tab.document.actions` is declared by
 * `ui-sidebar-documentpreview`, a package this plugin must not import *for
 * value*: it is not a row of the shell's module table, so a value import would
 * inline a second copy of another plugin's runtime identity and the build's
 * purity gate rejects that outright. A **type-only** import is the sanctioned
 * way to depend on another feature plugin's declarations, and it is what makes
 * the registration below ordinary typed code: the slot key, its `list`
 * cardinality and its `{ absolutePath }` owner props all come from that
 * package's own `SlotMap` augmentation (imported once, in `contracts.ts`).
 *
 * The runtime constraint stays: `ctx.slots.inject` is still the reason a
 * missing preview plugin degrades to "no toolbar entry" rather than a throw,
 * because `inject` only runs its callback once the seat is declared.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/toolbar
 */

import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { ClientContext } from '../../contracts.ts'
import type { PanelMount } from './panel-mount.ts'
import { IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement } from 'react'
import { NS } from './locales.ts'

/** The seat this contribution renders into, as the preview plugin declares it. */
const SEAT = 'sidebar.right.tab.document.actions'

/** The list-cell id this contribution registers under, unique within the seat. */
const TOGGLE_ID = 'dsh-tweaks:file-panel-toggle'

/** What the toggle reads and writes, as the registration's inject face. */
interface ToggleInjected {
  /** The panel's visibility, as the selector hook the renderer binds from this source. */
  hooks: { panelEnabled: HostObservable<boolean> }
  /**
   * Show or hide the docked panel.
   * @param enabled - the new value.
   */
  setPanelEnabled: (enabled: boolean) => void
}

/**
 * The toggle's props: the seat's owner data, this feature's copy, and its face.
 *
 * The owner data is not read; naming it is what ties the component to the
 * declaration it renders into, so a change to the seat's owner props is a
 * compile error here rather than a value that silently arrives unused.
 */
type ToggleProps = PropsRuntime<typeof SEAT>
  & PropsLocale<typeof NS>
  & InjectFace<ToggleInjected>

/**
 * Render the toggle.
 *
 * The pressed state arrives through the framework-bound selector hook, so the
 * chip is correct no matter what changed the preference, whether this control
 * or a restored session.
 * @param props - the seat's shares and this feature's face.
 * @param props.usePanelEnabled - the selector hook bound from this entry's `hooks` source.
 * @param props.setPanelEnabled - writes the visibility preference.
 * @param props.t - this feature's copy.
 * @returns the toggle button.
 */
function ToggleButton({ usePanelEnabled, setPanelEnabled, t }: ToggleProps): ReactNode {
  const enabled = usePanelEnabled(value => value)
  return createElement('button', {
    'type': 'button',
    'className': 'tool',
    // The host's own toolbar classes carry a build hash and are not knowable
    // here; the attribute is what a reader can find and a test can assert. The
    // plugin's stylesheet keys the built-in `.tool` values off the same marker,
    // so the button matches the toolbar it sits in.
    'data-dsh-tweaks-files-panel-toggle': '',
    'aria-pressed': enabled,
    'aria-label': t('panel.aria'),
    'title': enabled ? t('panel.hide') : t('panel.show'),
    'onClick': () => { setPanelEnabled(!enabled) },
  }, createElement(IconWorkspaceTreeOutlineRegular, { size: 15 }))
}

/** What the toggle needs to read and write. */
export interface ToggleOptions {
  /** The panel instance whose visibility the toggle controls. */
  readonly mount: Pick<PanelMount<Element>, 'enabled' | 'setEnabled' | 'subscribe'>
}

/**
 * Contribute the toggle to a file tab's document toolbar.
 * @param ctx - the client root context.
 * @param options - the panel whose visibility the control reads and writes.
 * @returns a disposer that removes the contribution.
 */
export function installPanelToggle(ctx: ClientContext, options: ToggleOptions): () => void {
  const enabled: HostObservable<boolean> = {
    getSnapshot: options.mount.enabled,
    subscribe: options.mount.subscribe,
  }
  return ctx.slots.inject(SEAT, () => ctx.slots.register({
    name: SEAT,
    id: TOGGLE_ID,
    locale: NS,
    inject: (): ToggleInjected => ({
      hooks: { panelEnabled: enabled },
      setPanelEnabled: (value) => { options.mount.setEnabled(value) },
    }),
  }, ToggleButton))
}
