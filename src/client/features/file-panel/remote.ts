/**
 * The Remote adapter: the workspace-files namespace reduced to the two calls
 * the panel makes.
 *
 * Three decisions live here, and they are the ones the upstream tree also
 * makes, for the same reasons:
 *
 * 1. **A listing keeps only `entries` and `truncated`.** The endpoint's `path`
 *    is the Host's own spelling of the directory; the panel keys its levels by
 *    the absolute path it asked for, so mixing the two would produce two keys
 *    for one directory.
 * 2. **A `RemoteResult` is never thrown.** The Remote contract returns a
 *    failure value rather than rejecting, so the whole adapter is one narrow
 *    conversion at the boundary and the controller above it has a single shape
 *    to handle.
 * 3. **Watching goes through `$stream`.** Calling the generated `changes`
 *    method directly would skip the reconnecting supervisor, so a dropped
 *    carrier would end the watch silently and automatic refresh would stop
 *    without saying so.
 *
 * `RemoteFace` is a structural parameter rather than a `ctx.remote` read for the
 * usual reason: the supervisor's `dispose`, the `ready` frame and the abort path
 * are all things a test can drive from a scripted fake, and they are exactly
 * the parts that fail invisibly in a browser.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/remote
 */

import type { RemoteFailure, RemoteResult, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceDirectoryEntry, WorkspaceFileWatchFrame } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { DirectoryIo, ListOutcome } from './controller.ts'

/** One listing as the endpoint returns it; the extra fields are ignored on purpose. */
interface ListingValue {
  readonly entries: readonly WorkspaceDirectoryEntry[]
  readonly truncated: boolean
}

/** The supervisor handle `$stream` returns, reduced to what this adapter uses. */
export interface StreamHandle<Item> extends AsyncIterable<{ readonly value: Item, accept: () => void }> {
  /** Stop the current generation and wait for the consumer to become quiescent. */
  readonly dispose: () => Promise<void>
}

/** The Remote surface this adapter needs. `ClientRemote` satisfies it. */
export interface RemoteFace {
  readonly workspaceFiles: {
    readonly list: (
      sessionId: SessionId,
      path: string,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<ListingValue>>
    readonly changes: (
      sessionId: SessionId,
      path: string,
      signal?: AbortSignal,
    ) => AsyncIterable<WorkspaceFileWatchFrame>
  }
  readonly $stream: <Item>(options: {
    readonly name: string
    readonly open: (signal: AbortSignal) => AsyncIterable<Item>
    readonly ended: (accepted: boolean) => Error
  }) => StreamHandle<Item>
}

/**
 * Build the panel's Remote face.
 * @param remote - the client Remote carrier, as `ctx.remote` exposes it.
 * @returns the two operations the panel reads through.
 */
export function createDirectoryIo(remote: RemoteFace): DirectoryIo {
  return {
    async list(sessionId, path, signal): Promise<ListOutcome> {
      const result = await remote.workspaceFiles.list(sessionId, path, signal)
      if (!result.ok)
        return { ok: false, error: result.error }
      // Only the two fields the tree draws with; the endpoint's own `path`
      // spelling would make a second key for the directory the panel already
      // knows by the absolute path it asked for.
      return { ok: true, value: { entries: result.value.entries, truncated: result.value.truncated } }
    },
    watch: (sessionId, path, signal) => watch(remote, sessionId, path, signal),
  }
}

/**
 * Follow one directory through the reconnecting supervisor.
 *
 * The `ready` frame is accepted and then dropped: it exists so the consumer can
 * confirm its opening baseline, and this consumer has none: it re-reads on
 * every `change` and never resumes from a cursor.
 * @param remote - the carrier.
 * @param sessionId - the session whose workspace scopes the path.
 * @param path - the directory's absolute path.
 * @param signal - cancellation.
 * @returns the frames the panel cares about.
 */
async function* watch(
  remote: RemoteFace,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): AsyncIterable<'ready' | 'change'> {
  if (signal.aborted)
    return
  const stream = remote.$stream<WorkspaceFileWatchFrame>({
    name: `file panel directory ${path}`,
    open: lifetime => remote.workspaceFiles.changes(sessionId, path, lifetime),
    ended: () => new Error(`File panel directory watch ended: ${path}`),
  })
  // Abort and an exhausted iterator must both release the supervisor; the
  // `finally` covers the second, and the listener covers an abort that arrives
  // while this consumer is parked on a frame that will never come.
  const abort = (): void => {
    void stream.dispose()
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for await (const item of stream) {
      if (signal.aborted)
        return
      if (item.value.kind === 'ready') {
        item.accept()
        yield 'ready'
        continue
      }
      yield 'change'
    }
  }
  finally {
    signal.removeEventListener('abort', abort)
    await stream.dispose()
  }
}

/** Whether a failure means the underlying filesystem cannot watch at all. */
export function isWatchUnsupportedFailure(failure: RemoteFailure): boolean {
  return failure.code === 'workspace-file/watch-unsupported'
}

/** Re-exported so callers can name the failure type without a second import. */
export type { RemoteFailure }
