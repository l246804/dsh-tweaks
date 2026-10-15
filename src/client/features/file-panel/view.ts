/**
 * The panel's view: the filter row, the tree, and the states in between.
 *
 * The markup and class names are the built-in tree's, term for term, because the
 * whole point of taking the `files` kind over is that a reader cannot tell it
 * happened. Two things are the panel's own:
 *
 * - the **filter row**, which the built-in tree does not have, and which sits
 *   above the scroller rather than inside it so the tree's scrolling cannot
 *   carry it away;
 * - the **active row**, marked `aria-current`, for the file the active tab is
 *   showing. The built-in tree has no such notion, because it only ever lived
 *   in the tab it was opened from.
 *
 * Icons and file classification come from `@deepseek-ai/dsh-client-ui-primitives`
 * (the same module the built-in tree draws with, and one of the shell's own
 * module-table rows), so the glyphs are the same objects rather than copies.
 *
 * The view holds no state: the filter's text, the expansion and the loaded
 * levels all live in the controller one layer up, which is what makes them
 * survive the container being moved between tabs.
 *
 * Written with `createElement` rather than JSX deliberately. The unused-dependency
 * check's project glob covers TypeScript files only, so a `.tsx` view would be
 * invisible to it, and the `react` dependency this file genuinely needs would be
 * reported as unused. One file's worth of `createElement` buys a truthful
 * dependency graph.
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
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement } from 'react'
import { PANEL_SCROLL_ATTRIBUTE } from './panel-host.ts'
import { nestRows, visibleRows } from './tree.ts'

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
      'data-dsh-files-note': row.note,
      'data-dsh-files-path': row.path,
    }, noteText(row.note, failure, t))
  }
  const name = row.entry.name
  if (row.kind === 'directory') {
    const expanded = children.length > 0
    return createElement('li', {
      key,
      'className': 'item',
      'data-files-entry': 'directory',
      'data-files-path': row.path,
      'data-dsh-files-path': row.path,
    }, [
      createElement('button', {
        'key': 'row',
        'type': 'button',
        'className': 'row',
        'aria-expanded': expanded,
        'data-dsh-files-toggle': row.path,
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
      'data-files-entry': 'file',
      'data-files-path': row.path,
      'data-dsh-files-path': row.path,
    }, createElement('button', {
      'type': 'button',
      'className': 'row',
      // The shell's tree has no active state; this is the panel's one addition,
      // and `aria-current` is the honest way to say "the tab shows this file".
      'aria-current': view.state.active === row.path ? 'true' : undefined,
      'data-dsh-files-open': row.path,
      'onClick': () => { view.onOpen(row.path) },
    }, [
      createElement(FileTypeIcon, { key: 'icon', kind: classifyFileType(name), size: 16, className: 'fileIcon' }),
      createElement('span', { key: 'name', className: 'name' }, name),
    ]))
  }
  return createElement('li', {
    key,
    'className': 'item',
    'data-files-entry': 'other',
    'data-files-path': row.path,
    'data-dsh-files-path': row.path,
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
 * Draw the panel.
 * @param view - the snapshot and the callbacks.
 * @returns the panel's markup.
 */
export function PanelBody(view: PanelViewState): ReactNode {
  const { state, t } = view
  if (state.root === undefined) {
    return createElement('div', { 'className': 'status', 'data-dsh-files-state': 'no-workspace' }, createElement('p', { className: 'statusLine' }, t('noWorkspace')))
  }
  const rows = rowsOf(state)
  return createElement('div', {
    'className': 'root',
    'data-dsh-files-state': 'tree',
    'data-dsh-files-root': state.root,
  }, [
    // Inside the tab body, outside the tree's scroller: scrolling the tree must
    // not carry the filter away with it.
    createElement('div', { key: 'filter', className: 'filter' }, createElement('input', {
      'type': 'search',
      'value': state.filter,
      'aria-label': t('filter.aria'),
      'placeholder': t('filter.placeholder'),
      'data-dsh-files-filter': '',
      'onChange': (event: { currentTarget: { value: string } }) => { view.onFilter(event.currentTarget.value) },
    })),
    createElement('div', {
      'key': 'body',
      'className': 'body',
      [PANEL_SCROLL_ATTRIBUTE]: '',
      'data-dsh-files-body': '',
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
      ? createElement('ul', { className: 'level' }, createElement('li', { 'className': 'note', 'data-dsh-files-note': 'empty' }, t('empty')))
      : createElement('ul', { className: 'level' }, nestRows(rows).map(node => rowElement(node, view)))),
  ])
}
