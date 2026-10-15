/**
 * The file tree's pure half: ordering, filtering, path joining, and the two
 * shape transitions a lazily loaded tree needs.
 *
 * Everything here is a function of its arguments. The tree's *state* lives in
 * `panel-state.ts`, and the two are deliberately separate: the rules a reader
 * can see (directories first, `file2` before `file10`, a filter that matches by
 * name) are the rules worth pinning with a test, and they should not need a
 * store to exercise.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/tree
 */

import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'

/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. Mirrors the built-in tree exactly, because the
 * panel replaces it and must not look like a different product.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array; the input is not mutated.
 */
export function orderEntries(entries: readonly WorkspaceDirectoryEntry[]): WorkspaceDirectoryEntry[] {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory')
    return group !== 0 ? group : byName.compare(left.name, right.name)
  })
}

/**
 * Whether one entry name matches the filter.
 * @param name - the entry's name.
 * @param query - the filter as typed; blank matches everything.
 * @returns whether the name should be shown.
 */
export function matchFilter(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '')
    return true
  return name.toLowerCase().includes(needle)
}

/**
 * Filter one level's entries by name.
 * @param entries - the level's entries.
 * @param query - the filter as typed.
 * @returns the entries to show, in their original order.
 */
export function filterEntries(entries: readonly WorkspaceDirectoryEntry[], query: string): WorkspaceDirectoryEntry[] {
  return entries.filter(entry => matchFilter(entry.name, query))
}

/**
 * Join a parent path and a child name the way the endpoint spells them.
 * @param parent - an absolute directory path, or the empty string at the root.
 * @param name - the child's name.
 * @returns the child's absolute path.
 */
export function childPath(parent: string, name: string): string {
  return `${parent.replace(/[/\\]+$/u, '')}/${name}`
}

/** Whether `path` is `ancestor` itself or lies under it. */
function isUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`)
}

/**
 * Drop the cached levels and expansion marks of directories that vanished from
 * a re-read listing.
 *
 * A directory can disappear between two reads (deleted, or replaced by a
 * file). Its cached level would otherwise linger and be rendered again the
 * moment the reader expands a directory that no longer lists it.
 * @param expanded - the currently expanded paths.
 * @param levels - cached levels keyed by path.
 * @param parent - the directory whose listing was just applied.
 * @param entries - the listing's entries, after ordering.
 * @returns the surviving expansion list, in its original order.
 */
export function pruneExpansion(
  expanded: readonly string[],
  levels: Readonly<Record<string, unknown>>,
  parent: string,
  entries: readonly WorkspaceDirectoryEntry[],
): { readonly expanded: string[], readonly removed: readonly string[] } {
  const alive = new Set(entries.filter(entry => entry.type === 'directory').map(entry => childPath(parent, entry.name)))
  const removed: string[] = []
  for (const path of [...Object.keys(levels), ...expanded]) {
    if (!isUnder(path, parent) || path === parent || alive.has(path))
      continue
    if (!removed.includes(path))
      removed.push(path)
  }
  return { expanded: expanded.filter(path => !removed.includes(path)), removed }
}

/**
 * Flatten the tree into the rows to draw, depth first, in display order.
 *
 * Without a filter, only expanded directories contribute their children, so the
 * row list is exactly what the reader has opened, which is also what makes the
 * tree's height a function of the loaded levels, and the reason the
 * `activation` seam waits for pending listings before scrolling.
 *
 * With a filter, the traversal searches every *loaded* level instead of only
 * the expanded ones: a match under a collapsed directory is otherwise
 * unreachable, since nothing would ever draw the row that leads to it. A level
 * that has never been listed has nothing to search, so a filter cannot find
 * files the reader has never browsed near, an honest limit of a lazily loaded
 * tree, and the reason the search is by name over what is known.
 * @param root - the workspace root's absolute path.
 * @param levels - cached levels keyed by absolute path.
 * @param expanded - the expanded paths.
 * @param filter - the filter as typed.
 * @returns one row per visible entry, plus any note rows explaining a state.
 */
export function visibleRows(
  root: string,
  levels: Readonly<Record<string, LevelView>>,
  expanded: readonly string[],
  filter = '',
): VisibleRow[] {
  const searching = filter.trim() !== ''
  const rows: VisibleRow[] = []
  const note = (path: string, depth: number, kind: NoteKind, failure?: unknown): void => {
    rows.push({ kind: 'note', path, depth, note: kind, ...failure === undefined ? {} : { failure } })
  }

  /**
   * Emit one level's rows; report whether any row was emitted at or below it.
   * @param path - the level's absolute path.
   * @param depth - its nesting depth.
   * @param announced - whether its children already lead to an announced row, so its own state is not worth a note.
   * @returns whether anything was emitted.
   */
  function walk(path: string, depth: number, announced: boolean): boolean {
    const level = levels[path]
    const entries = level?.kind === 'ready' ? level.entries ?? [] : undefined
    if (entries === undefined) {
      if (!announced)
        note(path, depth, level?.kind === 'failed' ? 'failed' : 'loading', level?.failure)
      return false
    }
    // A failed refresh sits above rows that are still usable; both are shown.
    if (level?.failure !== undefined)
      note(path, depth, 'failed', level.failure)
    const mark = rows.length
    let emitted = level?.failure !== undefined
    for (const entry of entries)
      emitted = emitEntry(path, depth, entry) || emitted
    if (!searching && !announced && !emitted && entries.length === 0)
      note(path, depth, 'empty')
    if (level?.truncated === true) {
      note(path, depth, 'truncated')
      emitted = true
    }
    // Nothing under this level matched: a search rolled it back entirely.
    if (!emitted)
      rows.length = mark
    return emitted
  }

  /**
   * Emit one entry's row, and its level's rows when the entry is a directory.
   *
   * The two search rules meet here. A file that does not match is skipped. A
   * directory is drawn when its own name matches, or when something below it
   * does; a directory that leads to nothing is rolled back, because it was only
   * ever a way to look.
   * @param parent - the listing directory's absolute path.
   * @param depth - the row's nesting depth.
   * @param entry - the entry to draw.
   * @returns whether a row was kept for this entry.
   */
  function emitEntry(parent: string, depth: number, entry: WorkspaceDirectoryEntry): boolean {
    const path = childPath(parent, entry.name)
    if (entry.type !== 'directory') {
      if (searching && !matchFilter(entry.name, filter))
        return false
      rows.push({ kind: entry.type === 'file' ? 'file' : 'other', path, depth, entry })
      return true
    }
    const named = searching && matchFilter(entry.name, filter)
    // Outside a search every directory row is drawn, expanded or not.
    if (!searching) {
      rows.push({ kind: 'directory', path, depth, entry })
      if (expanded.includes(path))
        walk(path, depth + 1, false)
      return true
    }
    // While searching, descending ignores expansion: an unexpanded match would
    // otherwise be unreachable. A directory that leads to no match is rolled
    // back, because it was only ever a way to look.
    const mark = rows.length
    rows.push({ kind: 'directory', path, depth, entry })
    if (named || walk(path, depth + 1, named))
      return true
    rows.length = mark
    return false
  }

  walk(root, 0, false)
  if (searching && rows.every(row => row.kind === 'note'))
    return [{ kind: 'note', path: root, depth: 0, note: 'empty' }]
  return rows
}

/** The reasons a level's state becomes a note row. */
type NoteKind = 'loading' | 'failed' | 'empty' | 'truncated'

/** The part of a cached level this module reads. */
export interface LevelView {
  readonly kind: 'loading' | 'ready' | 'failed'
  /** The rows of a listed level; absent while it is loading or after it failed. */
  readonly entries?: readonly WorkspaceDirectoryEntry[]
  readonly truncated?: boolean
  readonly failure?: unknown
}

/** One row of the flattened tree. */
export type VisibleRow
  = | { readonly kind: 'note', readonly path: string, readonly depth: number, readonly note: 'loading' | 'failed' | 'empty' | 'truncated', readonly failure?: unknown }
    | { readonly kind: 'directory' | 'file' | 'other', readonly path: string, readonly depth: number, readonly entry: WorkspaceDirectoryEntry }

/** One row plus whatever the tree draws beneath it. */
export interface RowNode {
  /** A stable key for this node, unique within one render. */
  readonly key: string
  /** The row itself. */
  readonly row: VisibleRow
  /** The rows nested under it, in display order. */
  readonly children: readonly RowNode[]
}

/**
 * Rebuild the tree shape from the flattened rows.
 *
 * The shell's tree expresses nesting as nested `<ul>` elements, and its
 * indentation is the CSS of that nesting rather than a computed offset. The flat
 * list is what the ordering and filtering rules produce, and what a test can
 * state simply, so the nesting is reconstructed here, once, instead of being
 * re-derived inside a renderer.
 *
 * A row's depth is at most one greater than its predecessor's, because the
 * flattening is depth-first; a row that skipped a level would be a bug in
 * {@link visibleRows}, and this places it under the nearest shallower ancestor
 * rather than throwing during a render.
 * @param rows - the flattened rows, in display order.
 * @returns one root node per top-level row.
 */
export function nestRows(rows: readonly VisibleRow[]): RowNode[] {
  const roots: RowNode[] = []
  /** The open directory ancestors, innermost last, each with its own depth. */
  const open: { readonly depth: number, readonly children: RowNode[] }[] = []
  for (const row of rows) {
    const node: { key: string, row: VisibleRow, children: RowNode[] } = {
      key: `${row.kind}:${row.path}:${row.depth}`,
      row,
      children: [],
    }
    // Close every ancestor at or below this row's depth; the innermost
    // shallower one, if any, is where the row belongs.
    while (open.length > 0 && open[open.length - 1]!.depth >= row.depth)
      open.pop()
    const parent = open[open.length - 1]
    if (parent === undefined)
      roots.push(node)
    else
      parent.children.push(node)
    // Only a directory can own children. A note describes a level rather than
    // opening one, so it never becomes a parent.
    if (row.kind === 'directory')
      open.push({ depth: row.depth, children: node.children })
  }
  return roots
}
