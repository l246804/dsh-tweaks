/**
 * When the panel is allowed to move the tree, driven through the real mount.
 *
 * The reveal has two halves, tested apart on purpose. *Where* it lands is
 * arithmetic, and `reveal.test.ts` pins it with hand-worked numbers. *When* it
 * happens is this file: the activation chain loads one directory at a time, so
 * the list is short, then taller, then final, and a reveal issued on any early
 * state lands where the file will not be. The claim is therefore a negative one:
 * between the tab switch and the last listing settling, the panel must not touch
 * the scroller. The evidence is a scroller that records what the panel writes to
 * it, driven by the real `revealRow` rather than by a recording stub.
 *
 * Two guards keep those negatives from being vacuous. The scroller is already
 * scrolled away from the top before the chain loads, so "no write" cannot be
 * confused with "it had nowhere to go"; and the scrollable range is asserted to
 * be non-empty at the same moment, so a reveal *could* have moved it.
 *
 * Rows are drawn from `visibleRows`, the same flattening the view renders, so the
 * list really does grow as the levels land. The geometry is the measured tree
 * (`measured-panel.ts`), because the shared stand-in deliberately has none.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/reveal-mount
 */

import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { DirectoryIo, ListOutcome } from '../../../src/client/features/file-panel/controller.ts'
import type { PanelMount, PanelRenderer, PanelView } from '../../../src/client/features/file-panel/panel-mount.ts'
import type { FakeNode } from './fake-host-dom.ts'
import { describe, expect, it } from 'vitest'
import { SIDEBAR_RIGHT_ANCHORS } from '../../../src/client/dom/host-anchors.ts'
import { createPanelController } from '../../../src/client/features/file-panel/controller.ts'
import { createPanelMount } from '../../../src/client/features/file-panel/panel-mount.ts'
import { revealRow } from '../../../src/client/features/file-panel/reveal.ts'
import { visibleRows } from '../../../src/client/features/file-panel/tree.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { fakeHostDom } from './fake-host-dom.ts'
import { sessionId } from './ids.ts'
import { asElement, measuredTree } from './measured-panel.ts'

/** A directory's entries, by absolute path. */
type Levels = Record<string, WorkspaceDirectoryEntry[]>

const file = (name: string): WorkspaceDirectoryEntry => ({ name, type: 'file' })
const dir = (name: string): WorkspaceDirectoryEntry => ({ name, type: 'directory' })

/** Enough siblings that the scroller has a real range to be scrolled inside. */
function filler(count: number): WorkspaceDirectoryEntry[] {
  return Array.from({ length: count }, (_unused, index) => file(`f${index}.ts`))
}

/** The shape the numbers below are derived from: a 100px viewport of 38px rows. */
const ROW_HEIGHT = 38
const PADDING = 8
const VIEWPORT_HEIGHT = 100

/**
 * Where the reader was before any of this, in pixels.
 *
 * A real offset, inside the range every state in these tests actually has, so
 * "nothing moved" is a claim about a scroller a browser could be holding rather
 * than about an impossible position. Each test asserts it is still in range at
 * the moment it checks that no write happened.
 */
const READER_OFFSET = 200

/** Let every resolved promise callback run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** The address of one file in session `s1`, rooted at `/w`. */
const fileAddress = (path: string): string => `dsh-resource://file/session/s1/${path}`

/**
 * A Remote face whose listings settle only when the test says so.
 *
 * The parent chain is the whole subject, so no listing may answer on its own: a
 * scripted delay would decide the order for us. Watching is likewise driven by
 * hand, one directory at a time, so a refresh can be raised for exactly one tree
 * node.
 * @param levels - what each directory lists when it is finally answered.
 * @returns the face, what it was asked, and the two ways to settle it.
 */
function gatedIo(levels: Levels) {
  const outstanding = new Map<string, (outcome: ListOutcome) => void>()
  const watchers = new Map<string, ((frame: IteratorResult<'ready' | 'change'>) => void)[]>()
  const lists: string[] = []

  const io: DirectoryIo = {
    list: (_sessionId, path) => {
      lists.push(path)
      return new Promise<ListOutcome>((resolve) => {
        outstanding.set(path, resolve)
      })
    },
    watch: (_sessionId, path, signal) => ({
      [Symbol.asyncIterator]: () => {
        const queued: IteratorResult<'ready' | 'change'>[] = [{ done: false, value: 'ready' }]
        return {
          next(): Promise<IteratorResult<'ready' | 'change'>> {
            const ready = queued.shift()
            if (ready !== undefined)
              return Promise.resolve(ready)
            if (signal.aborted)
              return Promise.resolve({ done: true, value: undefined })
            return new Promise((resolve) => {
              const waiting = watchers.get(path) ?? []
              waiting.push(resolve)
              watchers.set(path, waiting)
            })
          },
          return(): Promise<IteratorResult<'ready' | 'change'>> {
            return Promise.resolve({ done: true, value: undefined })
          },
        } as AsyncIterator<'ready' | 'change'>
      },
    }) as AsyncIterable<'ready' | 'change'>,
  }

  return {
    io,
    lists,
    /** Answer the read outstanding for one directory. */
    async answer(path: string): Promise<void> {
      const resolve = outstanding.get(path)
      if (resolve === undefined)
        throw new Error(`gated-io: nothing is being read at ${path}`)
      outstanding.delete(path)
      resolve({ ok: true, value: { entries: levels[path] ?? [], truncated: false } })
      await settle()
    },
    /** Push one change into exactly one directory's watch. */
    async change(path: string): Promise<void> {
      const waiting = watchers.get(path) ?? []
      watchers.set(path, [])
      for (const wake of waiting) wake({ done: false, value: 'change' })
      await settle()
    },
    /** Whether a read for this directory is still outstanding. */
    reading: (path: string): boolean => outstanding.has(path),
  }
}

/**
 * Mount the panel over a gated Remote face, drawing real rows and revealing with
 * the real `revealRow`.
 *
 * The scroller starts at an offset the reader owns, and the ledger only counts
 * what the *panel* writes: {@link Mounted.watchWrites} installs the accessor, and
 * {@link Mounted.readerScrollsTo} moves the element the way the wheel does, from
 * outside the ledger.
 * @param levels - what each directory lists.
 * @returns the mount, its controller, the measured tree and the scroll ledger.
 */
async function mount(levels: Levels) {
  const fake = createFakeDom()
  const remote = gatedIo(levels)
  const controller = createPanelController(remote.io)
  const tree = measuredTree({
    document: fake.document,
    viewportHeight: VIEWPORT_HEIGHT,
    rowHeight: ROW_HEIGHT,
    padding: PADDING,
  })
  // Declared before the renderer because the renderer's commit callback reaches
  // the mount: drawing the rows and reporting the commit are one step here, which
  // is what a synchronous stub does.
  let mount: PanelMount<FakeNode>
  // The view's own flattening, so what is drawn is what the state says.
  const render: PanelRenderer<FakeNode> = (container, view: PanelView) => {
    const rows = view.state.root === undefined
      ? []
      : visibleRows(view.state.root, view.state.levels, view.state.expanded, view.state.filter)
    tree.draw(container, rows.map(row => row.path))
    mount.onRendered()
  }
  mount = createPanelMount<FakeNode>({
    dom: fakeHostDom(fake),
    controller,
    render,
    reveal: (container, path) => revealRow(asElement(container), path),
    storage: { getItem: () => null, setItem: () => {} },
  })

  /** Where the scroller sits. The accessor below reads and writes this. */
  let offset = 0
  /** Every offset the panel itself wrote. */
  const writes: number[] = []
  /** Whether the ledger is installed; before that, writes are plain. */
  let watched = false

  const body = (id: string) => {
    const element = fake.document.createElement('section')
    element.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, id)
    fake.document.body.appendChild(element)
    return element
  }

  return {
    mount,
    controller,
    tree,
    body,
    lists: () => remote.lists,
    answer: (path: string) => remote.answer(path),
    change: (path: string) => remote.change(path),
    reading: (path: string) => remote.reading(path),
    /**
     * Start recording, from an offset that is the reader's rather than the
     * panel's. Call once the first draw has created the scroller.
     * @returns the ledger, live and in write order.
     */
    watchWrites(): number[] {
      const scroller = tree.scroller()!
      offset = READER_OFFSET
      Object.defineProperty(scroller, 'scrollTop', {
        get: () => offset,
        set: (value: number) => {
          writes.push(value)
          offset = value
        },
      })
      watched = true
      return writes
    },
    /**
     * Turn the wheel: the browser moves the element, then the panel is told, as
     * its own `onScroll` would. Not a panel write, so not in the ledger.
     * @param next - where the reader left the scroller.
     */
    readerScrollsTo(next: number): void {
      if (!watched)
        throw new Error('mount: call watchWrites() before recording a reader scroll')
      offset = next
      controller.setScroll(next)
    },
    offset: (): number => offset,
  }
}

/** The scrollable range, which a reveal needs to be non-zero to be able to move. */
const rangeOf = (scrollHeight: number): number => Math.max(0, scrollHeight - VIEWPORT_HEIGHT)

describe('when the panel may move the tree', () => {
  it('does not touch the scroller while the ancestor chain is still loading', async () => {
    // Reaching /w/src/deep/a.ts means three listings, answered one at a time.
    const h = await mount({
      '/w': [dir('src'), ...filler(8)],
      '/w/src': [dir('deep'), file('g0.ts'), file('g1.ts')],
      '/w/src/deep': [file('a.ts'), file('h0.ts'), file('h1.ts')],
    })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    expect(h.lists()).toEqual(['/w'])

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/deep/a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    const writes = h.watchWrites()
    expect(h.lists()).toEqual(['/w', '/w/src', '/w/src/deep'])
    expect(h.controller.state().active).toBe('/w/src/deep/a.ts')

    // First level lands. Two directories of the chain still lack rows, so the
    // list is not final, and a reveal *could* have moved it, had one run.
    await h.answer('/w')
    expect(h.controller.pending(['/w', '/w/src', '/w/src/deep'])).toBe(2)
    // The reader's offset is inside the range, so a reveal could really have
    // moved the scroller here; nothing doing so is the point.
    expect(h.offset()).toBeLessThanOrEqual(rangeOf(h.tree.scroller()!.scrollHeight))
    expect(h.tree.rows.has('/w/src/deep/a.ts')).toBe(false)
    expect(writes).toEqual([])
    expect(h.offset()).toBe(READER_OFFSET)

    // Second level lands. One directory left, and still nothing has moved.
    await h.answer('/w/src')
    expect(h.controller.pending(['/w', '/w/src', '/w/src/deep'])).toBe(1)
    expect(h.offset()).toBeLessThanOrEqual(rangeOf(h.tree.scroller()!.scrollHeight))
    expect(h.tree.rows.has('/w/src/deep/a.ts')).toBe(false)
    expect(writes).toEqual([])
    expect(h.offset()).toBe(READER_OFFSET)

    // The last level lands: the row exists, and exactly one write now arrives.
    await h.answer('/w/src/deep')
    expect(h.controller.pending(['/w', '/w/src', '/w/src/deep'])).toBe(0)
    const row = h.tree.rows.get('/w/src/deep/a.ts')!
    // The row is the third drawn: 8 + 2 * 38 = 84, and 84 - (100 - 38) / 2 = 53.
    expect(row.offsetTop).toBe(84)
    expect(writes).toEqual([53])
    expect(h.offset()).toBe(53)
    // Centred: half the viewport's leftover height sits above the row.
    expect(row.offsetTop - h.offset()).toBe((VIEWPORT_HEIGHT - ROW_HEIGHT) / 2)
  })

  it('leaves the reader alone once the row has been revealed', async () => {
    const h = await mount({
      '/w': [dir('src'), ...filler(8)],
      '/w/src': [dir('deep'), file('g0.ts'), file('g1.ts')],
      '/w/src/deep': [file('a.ts'), file('h0.ts'), file('h1.ts')],
    })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/deep/a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    const writes = h.watchWrites()
    await h.answer('/w')
    await h.answer('/w/src')
    await h.answer('/w/src/deep')
    expect(writes).toEqual([53])

    // The reader scrolls away, inside the range; the panel hears about it
    // through its own state.
    const away = 380
    expect(away).toBeLessThanOrEqual(rangeOf(h.tree.scroller()!.scrollHeight))
    h.readerScrollsTo(away)
    expect(writes).toHaveLength(1)
    expect(h.offset()).toBe(away)

    // A background refresh re-reads a directory and republishes; no yank.
    await h.change('/w')
    expect(h.reading('/w')).toBe(true)
    await h.answer('/w')
    expect(writes).toHaveLength(1)
    expect(h.offset()).toBe(away)
  })

  it('marks no file active when a non-file tab is on screen, and moves nothing', async () => {
    const h = await mount({
      '/w': [dir('src'), ...filler(8)],
      '/w/src': [file('a.ts')],
    })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    const writes = h.watchWrites()
    await h.answer('/w')
    await h.answer('/w/src')
    expect(h.controller.state().active).toBe('/w/src/a.ts')
    // The row is the second drawn: 8 + 38 = 46, and 46 - 31 = 15.
    expect(writes).toEqual([15])

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'guide', kind: 'guide' })
    await settle()
    // The mark is gone, and the panel has left the page.
    expect(h.controller.state().active).toBeUndefined()
    expect(h.mount.host()).toBeUndefined()
    expect(writes).toHaveLength(1)

    // Nothing a later state change does can resurrect the mark or the scroll.
    h.controller.setFilter('a')
    h.controller.setScroll(280)
    await settle()
    expect(h.controller.state().active).toBeUndefined()
    expect(writes).toHaveLength(1)
    expect(h.offset()).toBe(15)
  })
})
