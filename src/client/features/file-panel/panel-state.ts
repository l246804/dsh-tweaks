/**
 * The panel's state transitions, without a DOM and without a Remote.
 *
 * Every function here takes a state and returns a new one, which is what makes
 * the two rules a reader can feel (a refresh keeps the old rows, a collapse
 * keeps the loaded level) checkable in a plain test. The panel itself is a
 * single global instance, so this state is the one thing that must survive a
 * move between tabs.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/panel-state
 */

import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import { pruneExpansion } from './tree.ts'

/** One directory's cache entry. */
type LevelState
  = | { readonly kind: 'loading' }
    | {
      readonly kind: 'ready'
      readonly entries: readonly WorkspaceDirectoryEntry[]
      readonly truncated: boolean
      /** A failed refresh on top of usable rows: reported, never a blank tree. */
      readonly failure?: unknown
    }
    | { readonly kind: 'failed', readonly failure: unknown }

/** Everything one panel remembers. */
export interface PanelState {
  /** The session's workspace root, absent before a session's cwd is known. */
  readonly root: string | undefined
  /** Loaded levels, keyed by absolute path. */
  readonly levels: Readonly<Record<string, LevelState>>
  /** Expanded directories, root first. */
  readonly expanded: readonly string[]
  /** The filter as typed. */
  readonly filter: string
  /** The tree scroller's offset, so a move between tabs does not lose it. */
  readonly scrollTop: number
  /** Whether the panel docks beside a file's content, or the content fills the tab. */
  readonly enabled: boolean
  /** The absolute path of the file the active tab shows; the row to mark. */
  readonly active: string | undefined
}

/** The state before any session is known. */
export function createPanelState(enabled: boolean): PanelState {
  return { root: undefined, levels: {}, expanded: [], filter: '', scrollTop: 0, enabled, active: undefined }
}

/**
 * Point the panel at one session's workspace.
 *
 * The root is the tree's identity: a different session's cwd means a different
 * tree, so the loaded levels and expansion start over. The same root keeps
 * everything, which is what makes a tab switch show the same tree.
 * @param state - current state.
 * @param root - the workspace root, or undefined when no session is on screen.
 * @returns the next state.
 */
export function withRoot(state: PanelState, root: string | undefined): PanelState {
  if (root === undefined)
    return { ...state, root: undefined, levels: {}, expanded: [], active: undefined }
  if (state.root === root)
    return state
  return { ...state, root, levels: {}, expanded: [root], active: undefined }
}

/**
 * Mark a directory as being read.
 *
 * A level that already has rows is left alone: a refresh must not flash a
 * loading state over content the reader is looking at.
 * @param state - current state.
 * @param path - the directory's absolute path.
 * @returns the next state.
 */
export function levelLoading(state: PanelState, path: string): PanelState {
  if (state.levels[path]?.kind === 'ready')
    return state
  return { ...state, levels: { ...state.levels, [path]: { kind: 'loading' } } }
}

/**
 * Apply a directory listing.
 *
 * Subdirectories that are gone from the new listing lose their cached level and
 * their expansion mark, so a re-read cannot leave stale rows reachable.
 * @param state - current state.
 * @param path - the directory's absolute path.
 * @param entries - the listing's entries.
 * @param truncated - whether the endpoint capped the listing.
 * @returns the next state.
 */
export function levelLoaded(
  state: PanelState,
  path: string,
  entries: readonly WorkspaceDirectoryEntry[],
  truncated: boolean,
): PanelState {
  const { expanded, removed } = pruneExpansion(state.expanded, state.levels, path, entries)
  const levels: Record<string, LevelState> = { ...state.levels }
  for (const gone of removed) delete levels[gone]
  levels[path] = { kind: 'ready', entries, truncated }
  return { ...state, levels, expanded }
}

/**
 * Record that a directory could not be read.
 *
 * With rows already loaded the failure is attached to them and the refresh
 * failure is announced under the directory; the rows stay, because an empty
 * tree would read as "this directory is empty" and that is a different, wrong
 * statement.
 * @param state - current state.
 * @param path - the directory's absolute path.
 * @param failure - the settled Remote failure.
 * @returns the next state.
 */
export function levelFailed(state: PanelState, path: string, failure: unknown): PanelState {
  const current = state.levels[path]
  if (current?.kind === 'ready')
    return { ...state, levels: { ...state.levels, [path]: { ...current, failure } } }
  return { ...state, levels: { ...state.levels, [path]: { kind: 'failed', failure } } }
}

/**
 * Expand or collapse one directory.
 *
 * Collapsing keeps a level's rows: re-expanding shows them immediately, and
 * the change stream is what keeps them honest. It does forget any level that has
 * no rows yet: a loading marker or a failure under a directory nobody is
 * looking at is a claim about a read that no longer has an owner.
 * @param state - current state.
 * @param path - the directory's absolute path.
 * @returns the next state.
 */
export function toggleExpanded(state: PanelState, path: string): PanelState {
  if (state.expanded.includes(path)) {
    const levels = { ...state.levels }
    if (levels[path] !== undefined && levels[path].kind !== 'ready')
      delete levels[path]
    return { ...state, expanded: state.expanded.filter(entry => entry !== path), levels }
  }
  return { ...state, expanded: [...state.expanded, path] }
}

/** Set the filter. */
export function setFilter(state: PanelState, filter: string): PanelState {
  return state.filter === filter ? state : { ...state, filter }
}

/** Remember the scroller's offset. */
export function setScroll(state: PanelState, scrollTop: number): PanelState {
  return state.scrollTop === scrollTop ? state : { ...state, scrollTop }
}

/** Show or hide the docked panel. */
export function setEnabled(state: PanelState, enabled: boolean): PanelState {
  return state.enabled === enabled ? state : { ...state, enabled }
}

/** Mark which file's row is active, or clear the mark. */
export function setActive(state: PanelState, active: string | undefined): PanelState {
  return state.active === active ? state : { ...state, active }
}
