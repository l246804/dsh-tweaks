/**
 * The panel controller: one tree, one state, driven by a Remote face.
 *
 * This is where the two facts a reader can check without a browser meet: which
 * directories are watched (exactly the expanded ones) and what a failed refresh
 * does to the rows already on screen (nothing).
 *
 * The controller takes its Remote calls as an injected interface rather than
 * reaching for `ctx.remote`. That is what makes "a refresh error keeps the old
 * entries" and "unload cancels every subscription" assertions in a plain Node
 * test instead of claims about a browser.
 *
 * The reload gesture is the same read as a change notification, deliberately:
 * both go through `read`, so both keep the rows already on screen and neither
 * invents a state the reader did not ask for. A reload is therefore the root's
 * plain re-read, not a new subscription or an expansion.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/controller
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { PanelState } from './panel-state.ts'
import {
  createPanelState,
  levelFailed,
  levelLoaded,
  levelLoading,
  setActive,
  setEnabled,
  setFilter,
  setScroll,
  toggleExpanded,
  withRoot,
} from './panel-state.ts'

/** One directory listing as the panel needs it. */
interface DirectoryListing {
  readonly entries: readonly WorkspaceDirectoryEntry[]
  readonly truncated: boolean
}

/** The outcome of one listing, already reduced from the Remote's result shape. */
export type ListOutcome
  = | { readonly ok: true, readonly value: DirectoryListing }
    | { readonly ok: false, readonly error: unknown }

/**
 * The Remote operations the panel uses.
 *
 * Deliberately two methods and nothing else: the panel never sees a
 * `RemoteResult`, so the shape of a failure is decided at one boundary instead
 * of at every call site.
 */
export interface DirectoryIo {
  /**
   * List one directory.
   * @param sessionId - the session whose workspace scopes the path.
   * @param path - the directory's absolute path.
   * @param signal - cancellation.
   * @returns the listing, or a failure to report.
   */
  list: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<ListOutcome>
  /**
   * Follow one directory's changes until `signal` aborts.
   * @param sessionId - the session whose workspace scopes the path.
   * @param path - the directory's absolute path.
   * @param signal - cancellation.
   * @returns `ready` once the watch is active, then one item per change.
   */
  watch: (sessionId: SessionId, path: string, signal: AbortSignal) => AsyncIterable<'ready' | 'change'>
}

/** What the controller tells its owner, so a renderer can redraw. */
export interface PanelController {
  /** The current state; a stable reference between changes. */
  readonly state: () => PanelState
  /**
   * Subscribe to state changes.
   * @param listener - called after every change.
   * @returns the unsubscribe function.
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Point the panel at the session and workspace root on screen.
   * @param sessionId - the session whose workspace this is, or undefined when none is selected.
   * @param root - the session's cwd, or undefined when it has none.
   */
  readonly setTarget: (sessionId: SessionId | undefined, root: string | undefined) => void
  /**
   * Show or hide the docked panel.
   * @param enabled - the new value.
   */
  readonly setEnabled: (enabled: boolean) => void
  /**
   * Expand or collapse one directory, reading it when it is opened without rows.
   * @param path - the directory's absolute path.
   */
  readonly toggle: (path: string) => void
  /**
   * Open a directory if it is not already open, reading it when it has no rows.
   * @param path - the directory's absolute path.
   */
  readonly ensure: (path: string) => void
  /**
   * Set the filter.
   * @param filter - the filter as typed.
   */
  readonly setFilter: (filter: string) => void
  /**
   * Remember the tree scroller's offset.
   * @param scrollTop - the offset.
   */
  readonly setScroll: (scrollTop: number) => void
  /**
   * Mark which file is active, opening its ancestors.
   * @param chain - the ancestors to open, outermost first.
   * @param key - the active row's key, or undefined to clear the mark.
   */
  readonly activate: (chain: readonly string[], key: string | undefined) => void
  /**
   * How many of these directories are still missing usable rows.
   * @param chain - the directories to check.
   * @returns the count.
   */
  readonly pending: (chain: readonly string[]) => number
  /** Re-read the root directory, keeping the rows it already has. */
  readonly reload: () => void
  /** Where a directory's rows stand, for the caller's own decisions. */
  readonly levelOf: (path: string) => PanelState['levels'][string] | undefined
  /** Every directory this controller currently watches. */
  readonly watched: () => readonly string[]
  /** Stop every subscription and forget the state. */
  readonly dispose: () => void
}

/** One watched directory: its cancellation and its in-flight read. */
interface Watch {
  readonly controller: AbortController
  reading: Promise<void> | undefined
}

/**
 * Create the panel controller.
 * @param io - the Remote face the tree reads through.
 * @returns the controller.
 */
export function createPanelController(io: DirectoryIo): PanelController {
  let state = createPanelState(true)
  let sessionId: SessionId | undefined
  const listeners = new Set<() => void>()
  const watches = new Map<string, Watch>()

  const publish = (next: PanelState): void => {
    if (next === state)
      return
    state = next
    for (const listener of [...listeners]) listener()
  }

  /**
   * Read one watched directory in place, keeping whatever rows it already has.
   *
   * The in-flight marker is cleared *before* the settlement is published, not in
   * a `finally` after it. That ordering is the whole reason the activation seam
   * can wait: a listener woken by "this level now has rows" must see the pending
   * count already reduced, or the change that finally completes a chain would
   * still report one read outstanding and the reveal would be deferred forever.
   */
  const read = (path: string): void => {
    const watch = watches.get(path)
    const session = sessionId
    if (watch === undefined || session === undefined)
      return
    publish(levelLoading(state, path))
    const settle = (next: PanelState): void => {
      // A settlement for a directory that was collapsed or replaced must not
      // resurrect it: the watch identity is the guard, not the path alone.
      if (watch.controller.signal.aborted || watches.get(path) !== watch)
        return
      watch.reading = undefined
      publish(next)
    }
    const task = io.list(session, path, watch.controller.signal).then((result) => {
      settle(result.ok
        ? levelLoaded(state, path, result.value.entries, result.value.truncated)
        : levelFailed(state, path, result.error))
    }, (error: unknown) => {
      settle(levelFailed(state, path, error))
    }).finally(() => {
      if (watches.get(path) === watch)
        watch.reading = undefined
    })
    watch.reading = task
  }

  /** Keep one directory's rows following the filesystem until it is closed. */
  const follow = async (path: string, watch: Watch, session: SessionId): Promise<void> => {
    try {
      for await (const event of io.watch(session, path, watch.controller.signal)) {
        if (watch.controller.signal.aborted || watches.get(path) !== watch)
          return
        if (event === 'change')
          read(path)
      }
    }
    catch (error) {
      if (watch.controller.signal.aborted || watches.get(path) !== watch)
        return
      // Watching is the optional half of this feature: a filesystem that cannot
      // watch still lists, so the panel degrades to "read once" rather than
      // reporting a failure the reader can do nothing about.
      if (isWatchUnsupported(error))
        return
      publish(levelFailed(state, path, error))
    }
  }

  /** Begin watching one directory, unless it already is. */
  const open = (path: string): void => {
    const session = sessionId
    if (state.root === undefined || session === undefined || watches.has(path))
      return
    const watch: Watch = { controller: new AbortController(), reading: undefined }
    watches.set(path, watch)
    read(path)
    void follow(path, watch, session)
  }

  /** Stop watching one directory; a late listing settlement is discarded. */
  const close = (path: string): void => {
    const watch = watches.get(path)
    if (watch === undefined)
      return
    watches.delete(path)
    watch.controller.abort()
  }

  const closeAll = (): void => {
    for (const path of [...watches.keys()]) close(path)
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setTarget(nextSessionId, root) {
      const changedSession = nextSessionId !== sessionId
      const changedRoot = root !== state.root
      if (!changedSession && !changedRoot)
        return
      // A different session or a different root is a different tree: every
      // subscription belongs to the old one and must not outlive it.
      closeAll()
      sessionId = nextSessionId
      publish(withRoot(state, root))
      if (root !== undefined && nextSessionId !== undefined)
        open(root)
    },
    setEnabled(enabled) {
      publish(setEnabled(state, enabled))
    },
    toggle(path) {
      const wasExpanded = state.expanded.includes(path)
      publish(toggleExpanded(state, path))
      if (wasExpanded)
        close(path)
      else
        open(path)
    },
    ensure(path) {
      if (state.expanded.includes(path)) {
        open(path)
        return
      }
      publish(toggleExpanded(state, path))
      open(path)
    },
    setFilter(filter) {
      publish(setFilter(state, filter))
    },
    setScroll(scrollTop) {
      publish(setScroll(state, scrollTop))
    },
    activate(chain, key) {
      for (const path of chain) {
        if (state.root === undefined)
          break
        if (!state.expanded.includes(path))
          publish(toggleExpanded(state, path))
        open(path)
      }
      publish(setActive(state, key))
    },
    pending(chain) {
      let count = 0
      for (const path of chain) {
        const level = state.levels[path]
        const watch = watches.get(path)
        if (level === undefined || level.kind !== 'ready' || watch?.reading !== undefined)
          count += 1
      }
      return count
    },
    reload() {
      const root = state.root
      // No root means no target to re-read: a reload before a session's cwd is
      // known is a no-op rather than an error, because the button belongs to a
      // tab whose root is always known, and a state invented here would only be
      // a claim about a directory nobody named.
      if (root === undefined)
        return
      // The plain re-read on the watch the root already has, so the rows stay
      // while the listing is in flight and stay again if it fails. A root with no
      // watch is deliberately not re-watched: membership is the expanded set, and
      // `read` already answers that case by doing nothing.
      read(root)
    },
    levelOf: path => state.levels[path],
    watched: () => [...watches.keys()],
    dispose() {
      closeAll()
      listeners.clear()
      sessionId = undefined
      state = createPanelState(state.enabled)
    },
  }
}

/** Whether a failure is the "this filesystem cannot watch" degradation. */
function isWatchUnsupported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'workspace-file/watch-unsupported'
}
