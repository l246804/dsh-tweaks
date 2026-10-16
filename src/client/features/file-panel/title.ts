/**
 * The file-list tab's chip title: the folder sheet, then the tab's own text.
 *
 * The built-in files type registers a title component of its own, and losing it
 * is the visible half of a takeover: without one the chip falls back to the bare
 * registry text, so a reader who had the shipped tab sees the glyph vanish. This
 * reproduces that component rather than approximating it, because that is what
 * "an enhancement of the built-in files tab, with its reasonable presentation
 * kept" means for the chip.
 *
 * The icon and the text are one fragment in the seat's own container
 * (`SidebarRight.tsx` wraps the seat in the chip's span), so this adds no
 * element of its own and the host's chip styling still applies: the glyph is a
 * flex child, not a box this module positions.
 *
 * Written with `createElement` and `.ts` for the same reason every other view
 * module here is (see `view.ts`): the unused-dependency check's project glob
 * covers TypeScript files only, so a `.tsx` file would be invisible to it and
 * the `react` dependency this file genuinely needs would read as unused.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/title
 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement, Fragment } from 'react'

/**
 * Draw the file-list tab's chip.
 *
 * The tab's own title comes from the seat's information hook rather than from
 * this plugin: the registry captured it when the tab opened, and a page type's
 * title is a fixed label, so there is nothing here to compute.
 *
 * The glyph carries `titleIcon`, the plugin's own styling hook: the built-in
 * title gave its glyph `flex: none` through a class of its own, and without it
 * the SVG shrinks inside a narrow chip, because a flex child's default is to
 * shrink. A plain class rather than one of the plugin's `data-*` markers because
 * the icon component forwards only `className`; `view.ts` names its file glyph
 * `fileIcon` for the same reason, and `styles.ts` styles both by that name. It
 * is the plugin's own class, never the host's hashed CSS-module names, which
 * this plugin cannot select.
 * @param props - the tab information hook the title seat is dispatched with.
 * @param props.useTabInfo - the seat's hook, which reads the tab being titled.
 * @returns the folder sheet followed by the tab's title text.
 */
export function FilesPanelTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return createElement(Fragment, null, createElement(FileTypeIcon, { key: 'icon', kind: 'folder', size: 16, className: 'titleIcon' }), tab.title)
}
