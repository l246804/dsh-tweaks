/**
 * The panel's view: the page header, the filter row, the tree, and the seam.
 *
 * The markup and class names are the built-in tree's, term for term, because the
 * whole point of taking the `files` kind over is that a reader cannot tell it
 * happened. What is the panel's own:
 *
 * - the **page header**, the built-in tab's 38px row (root path, then reload).
 *   It exists only where the panel *is* the tab; docked beside a file, the
 *   file's own toolbar row is already that row and a second one would be a
 *   duplicate. That difference is the whole of `view.docked`'s meaning.
 * - the **filter row**, below the header when there is one and above the
 *   scroller always, so the tree's scrolling cannot carry it away. It is the
 *   shared `Input` primitive rather than a hand-written `<input>`: this is the
 *   product's own single-line field, so it already carries the theme's border,
 *   focus ring and placeholder ink.
 * - the **resize seam**, the drag handle on the panel's left edge. Only where
 *   the panel is docked: a width means nothing when the panel is the whole tab.
 * - the **active row**, marked `aria-current`, for the file the active tab is
 *   showing. The built-in tree has no such notion, because it only ever lived in
 *   the tab it was opened from.
 *
 * Icons, the path label, the input and file classification come from
 * `@deepseek-ai/dsh-client-ui-primitives` (the same module the built-in tree
 * draws with, and one of the shell's own module-table rows), so the glyphs are
 * the same objects rather than copies.
 *
 * The view holds no state: the filter's text, the expansion, the loaded levels
 * and the panel's width all live one layer down (the controller, and
 * `resizer.ts`'s module-level drag registry), which is what makes them survive
 * the container being moved between tabs.
 *
 * Written with `createElement` rather than JSX deliberately. The unused-dependency
 * check's project glob covers TypeScript files only, so a `.tsx` view would be
 * invisible to it, and the `react` dependency this file genuinely needs would be
 * reported as unused. One file's worth of `createElement` buys a truthful
 * dependency graph, and every user-interface module in this plugin makes the same
 * choice, so that constraint has one answer rather than one per file.
 *
 * The markup carries two families of attribute, and the difference matters:
 *
 * - `data-dsh-tweaks-files-*` are this plugin's **own** markers. They name rows,
 *   states, the scroller, the reload button and the seam, and they are what the
 *   plugin's own later reads look up (`reveal.ts` finds a row this way).
 * - `data-files-path` / `data-files-entry` are the **host's** own spelling,
 *   reproduced because this view exists to be indistinguishable from the
 *   built-in tree. They are part of the copied presentation rather than the
 *   plugin's identity, so they carry no plugin prefix (see `dom/markers.ts`).
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/view
 */

import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { PanelState } from './panel-state.ts'
import type { RowNode, VisibleRow } from './tree.ts'
import {
  classifyFileType,
  FileTypeIcon,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  Input,
  PathLabel,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement, useMemo } from 'react'
import { FILES_TREE_ANCHORS } from '../../dom/host-anchors.ts'
import { PANEL_SCROLL_ATTRIBUTE } from './panel-host.ts'
import { createPanelResizer, PANEL_RESIZER_ATTRIBUTE } from './resizer.ts'
import { nestRows, visibleRows } from './tree.ts'

/**
 * Add the plugin's own `data-*` markers to a primitive's props.
 *
 * The primitives' prop types are closed interfaces, so an unknown property is a
 * compile error even though React writes it to the DOM verbatim; the plugin
 * still wants its own markers on the two primitives it renders (`PathLabel` and
 * `Input`), because the stylesheet may only select this plugin's attributes, not
 * the host's hashed class names. The helper keeps that one widening in one place
 * and keeps the call sites ordinary property lists.
 * @param props - the primitive's own props.
 * @param markers - the plugin's markers, written onto the element.
 * @returns the props, plus the markers.
 */
function marked<P extends object>(props: P, markers: Record<`data-${string}`, string>): P {
  return { ...props, ...markers }
}

/** Everything the view draws from; a snapshot of the controller's state. */
export interface PanelViewState {
  /** The controller's state. */
  readonly state: PanelState
  /** The translate function bound to this plugin's namespace. */
  readonly t: TranslateNS<'dshTweaksFiles'>
  /** Expand or collapse one directory. */
  readonly onToggle: (path: string) => void
  /** Open one file. */
  readonly onOpen: (path: string) => void
  /** Change the filter. */
  readonly onFilter: (filter: string) => void
  /** Record the scroller's offset, so a move between tabs keeps it. */
  readonly onScroll: (scrollTop: number) => void
  /** The offset to restore the scroller to when the container arrives. */
  readonly restoreScrollTop: number
  /**
   * Called when the scroller is mounted with the panel's contents, so the owner
   * can bring the active row into view. Fires once per arrival, not per render.
   */
  readonly onScrollerReady: (scroller: HTMLElement) => void
  /**
   * Whether the panel is docked beside a file (`true`) or is the whole file-list
   * tab (`false`).
   *
   * The one thing it decides is the page header: docked, the file's own toolbar
   * row already sits above the panel, so the panel draws none.
   */
  readonly docked: boolean
  /** Re-read the current root directory. Only the page form has a button for it. */
  readonly onReload: () => void
}

/**
 * Say why a listing failed, in terms of the listing.
 *
 * The codes are the endpoint's own; the sentences are the built-in tree's, so a
 * reader sees the same explanation for the same situation.
 * @param t - the bound translate function.
 * @param failure - the settled Remote failure, if one is known.
 * @returns the line to show.
 */
function failureLine(t: TranslateNS<'dshTweaksFiles'>, failure: unknown): string {
  const code = typeof failure === 'object' && failure !== null && 'code' in failure
    ? (failure as RemoteFailure).code
    : undefined
  const message = typeof failure === 'object' && failure !== null && 'message' in failure
    ? String((failure as { message: unknown }).message)
    : String(failure)
  switch (code) {
    case 'workspace-file/not-found': return t('error.notFound')
    case 'workspace-file/outside-workspace': return t('error.outsideWorkspace')
    case 'workspace-file/not-directory': return t('error.notDirectory')
    case 'workspace-file/watch-unsupported': return t('error.watchUnsupported')
    // A carrier or unclassified host failure reaches the reader as itself: this
    // tree knows nothing useful to add to a transport-level message.
    default: return t('error.unavailable', { message })
  }
}

/** The text of one state row. */
function noteText(note: 'loading' | 'failed' | 'empty' | 'truncated', failure: unknown, t: TranslateNS<'dshTweaksFiles'>): string {
  switch (note) {
    case 'failed': return failureLine(t, failure)
    case 'empty': return t('empty')
    case 'truncated': return t('truncated')
    default: return t('loading')
  }
}

/** One row, plus the rows of its level when it is an expanded directory. */
function rowElement(node: RowNode, view: PanelViewState): ReactNode {
  const { row, children, key } = node
  const { t } = view
  if (row.kind === 'note') {
    const level = view.state.levels[row.path]
    const failure = row.failure ?? (level?.kind === 'failed' ? level.failure : undefined)
    return createElement('li', {
      key,
      'className': 'note',
      'data-dsh-tweaks-files-note': row.note,
      'data-dsh-tweaks-files-path': row.path,
    }, noteText(row.note, failure, t))
  }
  const name = row.entry.name
  if (row.kind === 'directory') {
    const expanded = children.length > 0
    return createElement('li', {
      key,
      'className': 'item',
      [FILES_TREE_ANCHORS.entry.name]: 'directory',
      [FILES_TREE_ANCHORS.path.name]: row.path,
      'data-dsh-tweaks-files-path': row.path,
    }, [
      createElement('button', {
        'key': 'row',
        'type': 'button',
        'className': 'row',
        'aria-expanded': expanded,
        'data-dsh-tweaks-files-toggle': row.path,
        'onClick': () => { view.onToggle(row.path) },
      }, [
        expanded
          ? createElement(IconFolderOpenRegular, { key: 'icon', className: 'icon' })
          : createElement(IconFolderCloseRegular, { key: 'icon', className: 'icon' }),
        createElement('span', { key: 'name', className: 'name' }, name),
      ]),
      expanded && createElement('ul', { key: 'level', className: 'level' }, children.map(child => rowElement(child, view))),
    ])
  }
  if (row.kind === 'file') {
    return createElement('li', {
      key,
      'className': 'item',
      [FILES_TREE_ANCHORS.entry.name]: 'file',
      [FILES_TREE_ANCHORS.path.name]: row.path,
      'data-dsh-tweaks-files-path': row.path,
    }, createElement('button', {
      'type': 'button',
      'className': 'row',
      // The shell's tree has no active state; this is the panel's one addition,
      // and `aria-current` is the honest way to say "the tab shows this file".
      'aria-current': view.state.active === row.path ? 'true' : undefined,
      'data-dsh-tweaks-files-open': row.path,
      'onClick': () => { view.onOpen(row.path) },
    }, [
      createElement(FileTypeIcon, { key: 'icon', kind: classifyFileType(name), size: 16, className: 'fileIcon' }),
      createElement('span', { key: 'name', className: 'name' }, name),
    ]))
  }
  return createElement('li', {
    key,
    'className': 'item',
    [FILES_TREE_ANCHORS.entry.name]: 'other',
    [FILES_TREE_ANCHORS.path.name]: row.path,
    'data-dsh-tweaks-files-path': row.path,
  }, createElement('span', {
    'className': 'row other',
    'aria-disabled': 'true',
    'title': t('entry.other'),
  }, createElement('span', { className: 'name' }, name)))
}

/** The rows to draw for the current state. */
function rowsOf(state: PanelState): VisibleRow[] {
  if (state.root === undefined)
    return []
  // The controller's level states and the tree's view of them are the same
  // shape; a level with no rows is "loading" as far as the flattening cares.
  return visibleRows(state.root, state.levels, state.expanded, state.filter)
}

/**
 * The file-list tab's 38px row: the root path, then reload at its end.
 *
 * A copy of the built-in tab's header rather than a new design, including the
 * tooltip the shipped button carries; the shortcut keys the built-in one shows
 * come from its own tab record, which this plugin's type has none of.
 * @param view - the snapshot and the callbacks.
 * @returns the header row.
 */
function headerElement(view: PanelViewState): ReactNode {
  const { state, t } = view
  return createElement('div', { key: 'header', className: 'header' }, [
    createElement(PathLabel, marked({
      key: 'path',
      path: state.root ?? '',
      className: 'path',
    }, { [FILES_TREE_ANCHORS.path.name]: '' })),
    createElement(Tooltip, {
      key: 'reload',
      label: t('reload'),
      side: 'bottom',
      delayMs: 500,
      children: createElement('button', {
        'type': 'button',
        'className': 'tool',
        'aria-label': t('reload'),
        'data-dsh-tweaks-files-reload': '',
        'onClick': () => { view.onReload() },
      }, createElement(IconRefreshOutlineRegular, { key: 'icon' })),
    }),
  ])
}

/**
 * The filter row: the shared `Input`, spanning the row.
 *
 * The primitive is the product's own field, so its border, focus ring and
 * placeholder ink are the ones every other search box in the shell has. Its
 * wrapper (the element `className` would land on) is a hashed CSS-module name
 * this plugin cannot select, so the row is a one-column grid and the field fills
 * the track by being its only item.
 * @param view - the snapshot and the callbacks.
 * @returns the filter row.
 */
function filterElement(view: PanelViewState): ReactNode {
  const { t } = view
  return createElement('div', { key: 'filter', className: 'filter' }, createElement(Input, marked({
    'icon': createElement(IconSearchOutlineRegular, { key: 'icon', size: 16 }),
    'type': 'search',
    'value': view.state.filter,
    'aria-label': t('filter.aria'),
    'placeholder': t('filter.placeholder'),
    'onChange': (event: { currentTarget: { value: string } }) => { view.onFilter(event.currentTarget.value) },
  }, { 'data-dsh-tweaks-files-filter': '' })))
}

/**
 * The seam: the panel's left edge, which the reader drags to set its width.
 *
 * The shape is the trajectory panel's details handle: a focusable
 * `role="separator"`, pointer capture for the drag, a double click to reset and
 * arrow keys to step. Its size and appearance come from the stylesheet, which
 * builds it the way the docking kit's own divider is built. The handlers come
 * from `resizer.ts`, which owns the arithmetic; this file only puts them on an
 * element.
 * @param resizer - the bound gesture.
 * @param view - the snapshot and the callbacks.
 * @returns the seam.
 */
function resizerElement(resizer: ReturnType<typeof createPanelResizer>, view: PanelViewState): ReactNode {
  return createElement('div', {
    'key': 'resizer',
    'className': 'resizer',
    'role': 'separator',
    'aria-orientation': 'vertical',
    'aria-label': view.t('resize.aria'),
    'tabIndex': 0,
    [PANEL_RESIZER_ATTRIBUTE]: '',
    'ref': resizer.onReady,
    'onPointerDown': resizer.onPointerDown,
    'onPointerMove': resizer.onPointerMove,
    'onPointerUp': resizer.onPointerUp,
    'onPointerCancel': resizer.onPointerCancel,
    'onDoubleClick': resizer.onDoubleClick,
    'onKeyDown': resizer.onKeyDown,
  })
}

/**
 * Draw the panel.
 * @param view - the snapshot and the callbacks.
 * @returns the panel's markup.
 */
export function PanelBody(view: PanelViewState): ReactNode {
  // One gesture per mounted panel, and none of them holds the drag: `resizer.ts`
  // keeps live drags keyed by the handle element, so a re-render that replaces
  // the handle cannot lose one in progress.
  const resizer = useMemo(() => createPanelResizer(), [])
  const { state, t } = view
  if (state.root === undefined) {
    return createElement('div', { 'className': 'status', 'data-dsh-tweaks-files-state': 'no-workspace' }, createElement('p', { className: 'statusLine' }, t('noWorkspace')))
  }
  const rows = rowsOf(state)
  return createElement('div', {
    'className': 'root',
    'data-dsh-tweaks-files-state': 'tree',
    'data-dsh-tweaks-files-root': state.root,
  }, [
    // The page's own header, and only the page's: docked, the file's toolbar row
    // above the panel is that row already.
    !view.docked && headerElement(view),
    // Inside the tab body, outside the tree's scroller: scrolling the tree must
    // not carry the filter away with it.
    filterElement(view),
    createElement('div', {
      'key': 'body',
      'className': 'body',
      [PANEL_SCROLL_ATTRIBUTE]: '',
      'data-dsh-tweaks-files-body': '',
      'ref': (element: HTMLElement | null): void => {
        if (element === null)
          return
        // A container that was *moved* keeps its own scroll offset in the
        // browser; this only restores a fresh one, and only when the offset is
        // genuinely elsewhere.
        if (element.scrollTop === 0 && view.restoreScrollTop !== 0)
          element.scrollTop = view.restoreScrollTop
        view.onScrollerReady(element)
      },
      'onScroll': (event: { currentTarget: { scrollTop: number } }) => { view.onScroll(event.currentTarget.scrollTop) },
    }, rows.length === 0
      ? createElement('ul', { className: 'level' }, createElement('li', { 'className': 'note', 'data-dsh-tweaks-files-note': 'empty' }, t('empty')))
      : createElement('ul', { className: 'level' }, nestRows(rows).map(node => rowElement(node, view)))),
    // The width is the panel's own even when undocked, but a seam is only
    // meaningful where there is something to drag it against.
    view.docked && resizerElement(resizer, view),
  ])
}
