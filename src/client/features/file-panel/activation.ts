/**
 * The activation seam (ticket #6 fills this in).
 *
 * Two questions, both answered without touching a panel:
 *
 * 1. **Which file is a tab showing?** The panel's host carries the current
 *    tab's resource address; from it this derives the file's absolute path and
 *    the chain of ancestor directories from the workspace root down to (but
 *    excluding) the file. #6 expands that chain level by level, which is what
 *    makes a lazily loaded tree reveal a file nobody has browsed to yet.
 * 2. **May the panel scroll now?** The chain above loads one directory at a
 *    time, so rows keep arriving above the target and the list grows under a
 *    scroll that already ran. The decision therefore has three answers, not
 *    two: scroll, wait for the in-flight listings, or do nothing because the
 *    activation has not changed. "Do nothing" is what keeps a background
 *    refresh or the reader's own scrolling from being yanked back.
 *
 * Both are pure and take the smallest possible input: an address plus a
 * workspace root, or three scalars. Nothing here references the panel's own
 * state types, so #6 can change this file alone.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/activation
 */

import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'

/** A file a tab shows, and the directories that must be open to see its row. */
export interface ActivationTarget {
  /** The session the address belongs to. */
  readonly sessionId: string
  /** The path relative to the workspace root, as the address carries it. */
  readonly relativePath: string
  /** The absolute path, which is what the tree keys its rows by. */
  readonly absolutePath: string
  /**
   * Ancestor directories to expand, outermost first, each an absolute path.
   * Root-down order matters: a parent must be listed before its child can be.
   */
  readonly chain: readonly string[]
  /** The row key to mark active: the file's absolute path. */
  readonly key: string
}

/** The scroll decision, as data. */
export type ScrollDecision
  /** Nothing to do: no activation, or the same one already handled. */
  = | 'idle'
  /** The activation is new, but its chain is still loading: scroll would land wrong. */
    | 'wait'
  /** Scroll the active row to the centre. */
    | 'scroll'

/** The scalars the scroll decision needs. */
export interface ScrollInput {
  /** The key the panel last scrolled to, or undefined when it never has. */
  readonly scrolledKey: string | undefined
  /** The key of the currently active file, or undefined when no file tab is active. */
  readonly activeKey: string | undefined
  /**
   * How many directory listings the active chain is still waiting on. Any
   * non-zero value means the list's height is not final yet.
   */
  readonly pending: number
}

/**
 * Read the file path out of a resource address.
 * @param address - a `dsh-resource://` address, or a page address such as `files`.
 * @returns the session and decoded path, or undefined when this address is not a session-scoped file.
 */
export function parseFileAddressPath(address: string): { readonly sessionId: string, readonly path: string } | undefined {
  const parsed = parseFileAddress(address)
  // An absolute-scope address belongs to no session, so no tab in a session's
  // panel can be showing it; there is nothing to activate.
  if (parsed === undefined || parsed.scope !== 'session')
    return undefined
  return { sessionId: parsed.sessionId, path: parsed.path }
}

/** Join a normalized root with a relative path, both slash-separated. */
function joinPath(root: string, relative: string): string {
  return `${root}/${relative}`
}

/**
 * Derive what a tab is showing from its address.
 * @param address - the tab's resource address.
 * @param workspaceRoot - the session's workspace root; without one there is no tree to activate in.
 * @returns the target, or undefined when there is nothing to activate.
 */
export function activationTarget(address: string, workspaceRoot: string | undefined): ActivationTarget | undefined {
  if (workspaceRoot === undefined || workspaceRoot === '')
    return undefined
  const parsed = parseFileAddressPath(address)
  if (parsed === undefined)
    return undefined
  // A trailing separator would double up in the join below; an inner empty
  // segment (a path written with `//`) must not become a directory of its own.
  const root = workspaceRoot.replace(/\/+$/u, '')
  const segments = parsed.path.split('/').filter(segment => segment !== '')
  if (segments.length === 0)
    return undefined
  const chain: string[] = [root]
  let walked = root
  for (const segment of segments.slice(0, -1)) {
    walked = joinPath(walked, segment)
    chain.push(walked)
  }
  const absolutePath = joinPath(root, segments.join('/'))
  return {
    sessionId: parsed.sessionId,
    relativePath: segments.join('/'),
    absolutePath,
    chain,
    key: absolutePath,
  }
}

/**
 * Decide whether the panel should scroll the active row into view.
 *
 * The order of the three questions is the whole point: an unchanged activation
 * settles it first, so a background refresh that adds a row cannot move the
 * reader, and a manual scroll is never fought.
 * @param input - the last scrolled key, the active key, and the pending listing count.
 * @returns what the panel may do now.
 */
export function decideScroll(input: ScrollInput): ScrollDecision {
  const { scrolledKey, activeKey, pending } = input
  if (activeKey === undefined)
    return 'idle'
  if (scrolledKey === activeKey)
    return 'idle'
  return pending > 0 ? 'wait' : 'scroll'
}
