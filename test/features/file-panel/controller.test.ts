/**
 * The controller, exercised against a scripted Remote face.
 *
 * Two behaviours here are the ones a browser test cannot state precisely:
 * a failed refresh must leave the rows that are already on screen, and unload
 * must leave no subscription behind. Both are facts about what the controller
 * stops doing*, so they are asserted by observing the fake's own ledgers.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/controller
 */

import type { DirectoryIo, ListOutcome } from '../../../src/client/features/file-panel/controller.ts'
import { describe, expect, it, vi } from 'vitest'
import { createPanelController } from '../../../src/client/features/file-panel/controller.ts'
import { sessionId } from './ids.ts'

const a = { name: 'a.ts', type: 'file' as const }
const src = { name: 'src', type: 'directory' as const }

/** A Remote face that answers from a script and records what it was asked. */
function fakeIo(script: Record<string, ListOutcome | (() => ListOutcome)> = {}) {
  const opens: string[] = []
  const aborted = new Set<string>()
  const lists: string[] = []
  /** Push a change into a directory's stream, waking its watcher. */
  const pending = new Map<string, ((value: IteratorResult<'ready' | 'change'>) => void)[]>()

  const io: DirectoryIo = {
    list: (sessionId, path, signal) => {
      lists.push(`${sessionId}:${path}`)
      void signal
      const answer = script[path] ?? { ok: true, value: { entries: [], truncated: false } }
      const value = typeof answer === 'function' ? answer() : answer
      return Promise.resolve(value)
    },
    watch: (sessionId, path, signal) => {
      opens.push(`${sessionId}:${path}`)
      signal.addEventListener('abort', () => {
        aborted.add(path)
      }, { once: true })
      const queued: IteratorResult<'ready' | 'change'>[] = [{ done: false, value: 'ready' }]
      const waiters: ((value: IteratorResult<'ready' | 'change'>) => void)[] = []
      pending.set(path, waiters)
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<'ready' | 'change'>> {
              const ready = queued.shift()
              if (ready !== undefined)
                return Promise.resolve(ready)
              if (signal.aborted)
                return Promise.resolve({ done: true, value: undefined })
              return new Promise((resolve) => {
                waiters.push(resolve)
              })
            },
            return(): Promise<IteratorResult<'ready' | 'change'>> {
              return Promise.resolve({ done: true, value: undefined })
            },
          } as AsyncIterator<'ready' | 'change'>
        },
      }
    },
  }
  return {
    io,
    opens,
    lists,
    aborted,
    /** Deliver one change to a watched directory. */
    async change(path: string): Promise<void> {
      const waiters = pending.get(path) ?? []
      for (const waiter of waiters.splice(0)) waiter({ done: false, value: 'change' })
    },
  }
}

/** Let every resolved promise callback run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('target and watching', () => {
  it('watches and reads the root as soon as a target is known', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src, a], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    expect(fake.opens).toEqual(['s1:/w'])
    expect(fake.lists).toEqual(['s1:/w'])
    expect(panel.state().expanded).toEqual(['/w'])
  })

  it('watches exactly the expanded directories', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.toggle('/w/src')
    await settle()
    expect(fake.opens).toEqual(['s1:/w', 's1:/w/src'])
  })

  it('stops watching a collapsed directory and reads it again on the next open', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.toggle('/w/src')
    await settle()
    panel.toggle('/w/src')
    expect(fake.aborted.has('/w/src')).toBe(true)

    panel.toggle('/w/src')
    await settle()
    expect(fake.opens.filter(path => path === 's1:/w/src')).toHaveLength(2)
  })

  it('keeps the rows of a collapsed directory, so reopening does not blank the tree', async () => {
    const fake = fakeIo({
      '/w': { ok: true, value: { entries: [src], truncated: false } },
      '/w/src': { ok: true, value: { entries: [a], truncated: false } },
    })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.toggle('/w/src')
    await settle()
    panel.toggle('/w/src')
    expect(panel.levelOf('/w/src')).toEqual({ kind: 'ready', entries: [a], truncated: false })
  })
})

describe('automatic refresh', () => {
  it('re-reads a directory in place when it changes', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [a], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    await fake.change('/w')
    await settle()
    expect(fake.lists).toEqual(['s1:/w', 's1:/w'])
  })

  it('keeps the old entries when a refresh fails, and reports the failure', async () => {
    let calls = 0
    const fake = fakeIo({
      '/w': () => {
        calls += 1
        return calls === 1
          ? { ok: true, value: { entries: [a], truncated: false } }
          : { ok: false, error: { code: 'gateway/internal', message: 'gone' } }
      },
    })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    await fake.change('/w')
    await settle()

    const level = panel.levelOf('/w')
    expect(level?.kind).toBe('ready')
    expect(level?.kind === 'ready' ? level.entries : []).toEqual([a])
    expect(level?.kind === 'ready' ? level.failure : undefined).toEqual({ code: 'gateway/internal', message: 'gone' })
  })

  it('degrades quietly when the filesystem cannot watch', async () => {
    const io: DirectoryIo = {
      list: () => Promise.resolve({ ok: true, value: { entries: [a], truncated: false } }),
      watch: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(Object.assign(new Error('no watch'), { code: 'workspace-file/watch-unsupported' })),
        }),
      }) as AsyncIterable<'ready' | 'change'>,
    }
    const panel = createPanelController(io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    const level = panel.levelOf('/w')
    expect(level?.kind).toBe('ready')
    expect(level?.kind === 'ready' ? level.failure : 'none').toBeUndefined()
  })

  it('reports a failure that is not the watch degradation', async () => {
    const io: DirectoryIo = {
      list: () => Promise.resolve({ ok: true, value: { entries: [a], truncated: false } }),
      watch: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(Object.assign(new Error('boom'), { code: 'gateway/cancelled' })),
        }),
      }) as AsyncIterable<'ready' | 'change'>,
    }
    const panel = createPanelController(io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    const level = panel.levelOf('/w')
    expect(level?.kind === 'ready' ? level.failure : undefined).toBeDefined()
  })

  it('ignores a settlement that arrives after the directory was collapsed', async () => {
    let resolveList: ((value: ListOutcome) => void) | undefined
    const io: DirectoryIo = {
      list: () => new Promise<ListOutcome>((resolve) => { resolveList = resolve }),
      watch: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }) }) as AsyncIterable<'ready' | 'change'>,
    }
    const panel = createPanelController(io)
    panel.setTarget(sessionId('s1'), '/w')
    panel.toggle('/w')
    resolveList?.({ ok: true, value: { entries: [a], truncated: false } })
    await settle()
    expect(panel.levelOf('/w')).toBeUndefined()
  })
})

describe('activation', () => {
  it('opens the ancestor chain outermost first and marks the file', async () => {
    const fake = fakeIo({
      '/w': { ok: true, value: { entries: [src], truncated: false } },
      '/w/src': { ok: true, value: { entries: [a], truncated: false } },
    })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.activate(['/w', '/w/src'], '/w/src/a.ts')
    await settle()
    expect(fake.opens).toEqual(['s1:/w', 's1:/w/src'])
    expect(panel.state().expanded).toEqual(['/w', '/w/src'])
    expect(panel.state().active).toBe('/w/src/a.ts')
  })

  it('reports nothing pending once every ancestor has rows', async () => {
    const fake = fakeIo({
      '/w': { ok: true, value: { entries: [src], truncated: false } },
      '/w/src': { ok: true, value: { entries: [a], truncated: false } },
    })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    expect(panel.pending(['/w', '/w/src'])).toBe(1)
    panel.activate(['/w', '/w/src'], '/w/src/a.ts')
    await settle()
    expect(panel.pending(['/w', '/w/src'])).toBe(0)
  })

  it('does not re-open a directory that is already expanded', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.activate(['/w'], '/w/a.ts')
    await settle()
    expect(fake.opens).toEqual(['s1:/w'])
    expect(panel.state().active).toBe('/w/a.ts')
  })
})

describe('changing the target', () => {
  it('cancels every subscription of the old workspace', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.toggle('/w/src')
    await settle()
    panel.setTarget(sessionId('s2'), '/other')
    await settle()
    expect(fake.aborted.has('/w')).toBe(true)
    expect(fake.aborted.has('/w/src')).toBe(true)
    expect(fake.opens).toEqual(['s1:/w', 's1:/w/src', 's2:/other'])
  })

  it('does nothing at all when the target is unchanged', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    expect(fake.opens).toEqual(['s1:/w'])
  })
})

describe('unload', () => {
  it('cancels every subscription and clears its own state', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [src], truncated: false } } })
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.toggle('/w/src')
    await settle()

    panel.dispose()
    expect(fake.aborted.has('/w')).toBe(true)
    expect(fake.aborted.has('/w/src')).toBe(true)
    expect(panel.watched()).toEqual([])
    expect(panel.state().root).toBeUndefined()
    expect(panel.state().levels).toEqual({})
  })

  it('stops notifying subscribers it was released from', async () => {
    const fake = fakeIo({ '/w': { ok: true, value: { entries: [a], truncated: false } } })
    const panel = createPanelController(fake.io)
    const listener = vi.fn()
    panel.subscribe(listener)
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.dispose()
    listener.mockClear()
    panel.setEnabled(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('is safe to call twice', () => {
    const fake = fakeIo()
    const panel = createPanelController(fake.io)
    panel.setTarget(sessionId('s1'), '/w')
    panel.dispose()
    panel.dispose()
    expect(panel.watched()).toEqual([])
  })
})

describe('notifications', () => {
  it('tells subscribers when the filter, the offset or the flag changes', () => {
    const fake = fakeIo()
    const panel = createPanelController(fake.io)
    const listener = vi.fn()
    panel.subscribe(listener)
    panel.setFilter('a')
    panel.setScroll(12)
    panel.setEnabled(false)
    expect(listener).toHaveBeenCalledTimes(3)
    expect(panel.state().filter).toBe('a')
    expect(panel.state().scrollTop).toBe(12)
    expect(panel.state().enabled).toBe(false)
  })
})

describe('the pending count a reveal waits on', () => {
  it('is already zero when the listener woken by the last listing runs', async () => {
    // The reveal is driven from a state-change listener, so the count has to be
    // reduced *before* the settlement is published. Otherwise the change that
    // completes a chain would still report a read outstanding, and the reveal
    // would be deferred on every change, forever.
    const fake = fakeIo({
      '/w': { ok: true, value: { entries: [src], truncated: false } },
      '/w/src': { ok: true, value: { entries: [a], truncated: false } },
    })
    const panel = createPanelController(fake.io)
    const observed: { path: string, pending: number }[] = []
    panel.subscribe(() => {
      const level = panel.levelOf('/w/src')
      if (level?.kind === 'ready')
        observed.push({ path: '/w/src', pending: panel.pending(['/w', '/w/src']) })
    })
    panel.setTarget(sessionId('s1'), '/w')
    await settle()
    panel.activate(['/w', '/w/src'], '/w/src/a.ts')
    await settle()
    expect(observed.length).toBeGreaterThan(0)
    expect(observed.every(entry => entry.pending === 0)).toBe(true)
  })
})
