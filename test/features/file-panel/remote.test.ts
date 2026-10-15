/**
 * The Remote adapter, driven by a scripted carrier.
 *
 * The two claims worth pinning here are the ones a browser will not tell you
 * about until it is too late: a `RemoteResult` failure stays a value instead of
 * becoming a rejection, and the watch goes through the supervisor (so abort and
 * exhaustion both reach `dispose`, and the supervisor is what reconnects).
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/remote
 */

import type { RemoteFace, StreamHandle } from '../../../src/client/features/file-panel/remote.ts'
import { describe, expect, it } from 'vitest'
import { createDirectoryIo, isWatchUnsupportedFailure } from '../../../src/client/features/file-panel/remote.ts'
import { sessionId } from './ids.ts'

type Frame = { readonly kind: 'ready' } | { readonly kind: 'change' }

/** One supervised item of whatever the stream carries. */
interface SupervisedOf<Item> {
  readonly value: Item
  readonly accept: () => void
}

/**
 * A supervisor handle over a queue this test pushes supervised items into.
 *
 * Generic in the carried item so the fake's own type is exact: `$stream<Item>`
 * then returns this value as the `StreamHandle<Item>` it already is, rather than
 * asserting one unrelated shape into another.
 * @param name - the diagnostic name the supervisor was opened with.
 * @param disposed - the ledger to record a release in.
 * @param initial - the items the stream starts with.
 * @returns the handle, plus the test's own push and close controls.
 */
function scriptedStream<Item>(name: string, disposed: string[], initial: readonly SupervisedOf<Item>[]) {
  const queue: SupervisedOf<Item>[] = [...initial]
  const waiters: ((result: IteratorResult<SupervisedOf<Item>>) => void)[] = []
  let closed = false
  const finish = (): void => {
    for (const waiter of waiters.splice(0))
      waiter({ done: true, value: undefined })
  }
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const item = queue.shift()
        if (item !== undefined)
          return Promise.resolve({ done: false as const, value: item })
        if (closed)
          return Promise.resolve({ done: true as const, value: undefined })
        return new Promise<IteratorResult<SupervisedOf<Item>>>((resolve) => {
          waiters.push(resolve)
        })
      },
      return: () => {
        closed = true
        finish()
        return Promise.resolve({ done: true as const, value: undefined })
      },
    }),
    dispose: async () => { disposed.push(name) },
    push: (item: SupervisedOf<Item>) => {
      const waiter = waiters.shift()
      if (waiter !== undefined)
        waiter({ done: false, value: item })
      else
        queue.push(item)
    },
    close: () => {
      closed = true
      finish()
    },
  }
}

/**
 * A carrier whose listing answers from a script and whose watch hands frames
 * through a supervisor this test drives.
 */
function fakeRemote(options: {
  list?: () => Promise<unknown>
} = {}) {
  const disposed: string[] = []
  const opened: string[] = []
  let stream: ReturnType<typeof scriptedStream<Frame>> | undefined

  const remote: RemoteFace = {
    workspaceFiles: {
      list: async () => (await options.list?.() ?? {
        ok: true,
        value: { entries: [{ name: 'a.ts', type: 'file' }], truncated: false, path: 'host/spelling' },
      }) as never,
      changes: () => (async function* () {})() as AsyncIterable<never>,
    } as never,
    $stream<Item>(spec: { name: string, open: (signal: AbortSignal) => AsyncIterable<Item> }): StreamHandle<Item> {
      opened.push(spec.name)
      const created = scriptedStream<Item>(spec.name, disposed, [
        { value: { kind: 'ready' } as Item, accept: () => {} },
      ])
      stream = created as ReturnType<typeof scriptedStream<Frame>>
      return created
    },
  }
  return {
    remote,
    disposed,
    opened,
    /** Deliver one change frame to the parked consumer. */
    push: (frame: Frame) => { stream?.push({ value: frame, accept: () => {} }) },
    close: () => { stream?.close() },
  }
}

describe('createDirectoryIo', () => {
  it('keeps only the entries and the truncated flag, not the endpoint\'s own path spelling', async () => {
    const io = createDirectoryIo(fakeRemote().remote)
    const result = await io.list(sessionId('s1'), '/w', new AbortController().signal)
    expect(result).toEqual({ ok: true, value: { entries: [{ name: 'a.ts', type: 'file' }], truncated: false } })
  })

  it('turns a Remote failure into a value, never a rejection', async () => {
    const io = createDirectoryIo(fakeRemote({
      list: async () => ({ ok: false, error: { code: 'gateway/internal', message: 'boom' } }),
    }).remote)
    const result = await io.list(sessionId('s1'), '/w', new AbortController().signal)
    expect(result).toEqual({ ok: false, error: { code: 'gateway/internal', message: 'boom' } })
  })

  it('carries a host workspace-file error code through unchanged', async () => {
    const io = createDirectoryIo(fakeRemote({
      list: async () => ({ ok: false, error: { code: 'workspace-file/not-directory', message: 'nope' } }),
    }).remote)
    const result = await io.list(sessionId('s1'), '/w', new AbortController().signal)
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : (result.error as { code: string }).code).toBe('workspace-file/not-directory')
  })
})

describe('the watch', () => {
  it('goes through the supervisor, so a dropped carrier is reconnected rather than a silent stop', async () => {
    const fake = fakeRemote()
    const io = createDirectoryIo(fake.remote)
    const controller = new AbortController()
    const task = (async () => {
      for await (const _frame of io.watch(sessionId('s1'), '/w', controller.signal)) {
        // Stop after the second frame, so the loop is what ends the watch.
        if (_frame === 'change')
          break
      }
    })()

    // Give the consumer a beat to park on the first frame, then push one.
    await new Promise(resolve => setTimeout(resolve, 0))
    fake.push({ kind: 'change' })
    await task
    expect(fake.opened).toEqual(['file panel directory /w'])
  })

  it('yields ready first, then one frame per change, and drops the ready baseline', async () => {
    const fake = fakeRemote()
    const io = createDirectoryIo(fake.remote)
    const controller = new AbortController()
    const frames: string[] = []
    const iterator = io.watch(sessionId('s1'), '/w', controller.signal)[Symbol.asyncIterator]()
    frames.push((await iterator.next()).value)
    const second = iterator.next()
    await new Promise(resolve => setTimeout(resolve, 0))
    fake.push({ kind: 'change' })
    frames.push((await second).value)
    controller.abort()
    await iterator.return?.(undefined)
    expect(frames).toEqual(['ready', 'change'])
  })

  it('releases the supervisor when the consumer aborts', async () => {
    const fake = fakeRemote()
    const io = createDirectoryIo(fake.remote)
    const controller = new AbortController()
    const iterator = io.watch(sessionId('s1'), '/w', controller.signal)[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toEqual({ done: false, value: 'ready' })
    controller.abort()
    await iterator.return?.(undefined)
    expect(fake.disposed).toContain('file panel directory /w')
  })

  it('releases the supervisor when the consumer simply stops iterating', async () => {
    const fake = fakeRemote()
    const io = createDirectoryIo(fake.remote)
    const controller = new AbortController()
    const iterator = io.watch(sessionId('s1'), '/w', controller.signal)[Symbol.asyncIterator]()
    // Consume the opening frame, then abandon the iteration the way a `for await`
    // loop with a `break` does: the generator's own `finally` must still release
    // the supervisor.
    await iterator.next()
    await iterator.return?.(undefined)
    expect(fake.disposed).toContain('file panel directory /w')
  })

  it('does nothing at all when it is already aborted', async () => {
    const fake = fakeRemote()
    const io = createDirectoryIo(fake.remote)
    const controller = new AbortController()
    controller.abort()
    const frames: string[] = []
    for await (const frame of io.watch(sessionId('s1'), '/w', controller.signal)) frames.push(frame)
    expect(frames).toEqual([])
    expect(fake.opened).toEqual([])
  })
})

describe('isWatchUnsupportedFailure', () => {
  it('recognizes the one code the panel degrades on', () => {
    expect(isWatchUnsupportedFailure({ code: 'workspace-file/watch-unsupported' } as never)).toBe(true)
    expect(isWatchUnsupportedFailure({ code: 'gateway/internal' } as never)).toBe(false)
  })
})
