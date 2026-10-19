/**
 * The panel instance: one container, moved between tabs, revealing the active
 * file only when it is legitimate to.
 *
 * These tests are the DOM-level half of the feature's two hard claims:
 *
 * 1. **One panel, moved.** A tab switch must not rebuild the tree. The evidence
 *    is node identity across the switch, plus the same state surviving it, and
 *    the reason it matters is that a second tree would mean a second set of
 *    directory subscriptions, which no user-visible symptom would reveal.
 * 2. **Reveal timing.** A parent chain loads one level at a time, so a reveal
 *    issued too early lands in the wrong place. It must therefore wait for every
 *    pending listing and fire exactly once per activation.
 *
 * The renderer here is a plain recorder, so what is under test is the mount's
 * sequencing rather than React. The reveal is likewise a recording function:
 * this layer decides *whether* and *when* to reveal, and `reveal.ts` (tested
 * separately with worked numbers) does the arithmetic.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/panel-mount
 */

import type { DirectoryIo } from '../../../src/client/features/file-panel/controller.ts'
import type { PanelMount, PanelRenderer, PanelView } from '../../../src/client/features/file-panel/panel-mount.ts'
import type { FakeNode } from './fake-host-dom.ts'
import { describe, expect, it } from 'vitest'
import { SIDEBAR_RIGHT_ANCHORS } from '../../../src/client/dom/host-anchors.ts'
import { createPanelController } from '../../../src/client/features/file-panel/controller.ts'
import { PANEL_HOST_ATTRIBUTE } from '../../../src/client/features/file-panel/panel-host.ts'
import { createPanelMount } from '../../../src/client/features/file-panel/panel-mount.ts'
import { visibleRows } from '../../../src/client/features/file-panel/tree.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { fakeHostDom } from './fake-host-dom.ts'
import { sessionId } from './ids.ts'

const a = { name: 'a.ts', type: 'file' as const }
const b = { name: 'b.ts', type: 'file' as const }
const src = { name: 'src', type: 'directory' as const }

/** A Remote face that lists from a script and never reports a change. */
function fakeIo(levels: Record<string, { name: string, type: 'file' | 'directory' | 'other' }[]> = {}): DirectoryIo {
  return {
    list: (_sessionId, path) => Promise.resolve({
      ok: true,
      value: { entries: levels[path] ?? [], truncated: false },
    }),
    watch: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }) }) as AsyncIterable<'ready' | 'change'>,
  }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** Mount a panel over a fake DOM and a scripted Remote face. */
async function mount(levels: Record<string, { name: string, type: 'file' | 'directory' | 'other' }[]> = {}) {
  const fake = createFakeDom()
  const dom = fakeHostDom(fake)
  const controller = createPanelController(fakeIo(levels))
  const views: PanelView[] = []
  const revealed: string[] = []
  const written: string[] = []
  // The renderer is built before the mount (index.ts does the same), and the
  // commit signal is what tells the mount the rows it asked for exist. A stub
  // commits synchronously, which is the timing shape `reveal-mount.test.ts`
  // deliberately departs from.
  let mount: PanelMount<FakeNode>
  const render: PanelRenderer<FakeNode> = (_container, view) => {
    views.push(view)
    mount.onRendered()
  }
  mount = createPanelMount({
    dom,
    controller,
    render,
    reveal: (_container, path) => {
      revealed.push(path)
      return 'centred'
    },
    storage: {
      getItem: () => null,
      setItem: (_key, value) => { written.push(value) },
    },
  })
  const body = bodyMaker(fake)
  return { mount, controller, document: fake.document, body, views, revealed, written }
}

/**
 * A maker of tab body elements, the way the shell renders them.
 * @param fake - the stand-in whose document the bodies live in.
 * @returns a function making one body per tab id.
 */
function bodyMaker(fake: ReturnType<typeof createFakeDom>) {
  return (id: string) => {
    const element = fake.document.createElement('section')
    element.setAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name, id)
    fake.document.body.appendChild(element)
    return element
  }
}

/** The address of one file in session `s1`, rooted at `/w`. */
const fileAddress = (path: string): string => `dsh-resource://file/session/s1/${path}`

describe('one panel, moved between tabs', () => {
  it('keeps the same container when the file tab changes', async () => {
    const h = await mount({ '/w': [src, a], '/w/src': [] })
    const filesBody = h.body('files')
    const fileBody = h.body('file-1')

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(filesBody, 'page')
    await settle()
    const container = h.mount.container()
    expect(h.mount.host()).toBe(filesBody)

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('a.ts'), kind: 'text' })
    h.mount.dockInto(fileBody, 'dock')
    await settle()

    // The very same node, in a different tab: moved, not rebuilt.
    expect(h.mount.container()).toBe(container)
    expect(h.mount.host()).toBe(fileBody)
    expect([...filesBody.children]).toEqual([])
    expect([...fileBody.children]).toEqual([container])
  })

  it('moves the rendered subtree without touching one node inside it', async () => {
    // The container's identity is necessary but not sufficient: what a second
    // tree would cost is the contents. This renderer builds its markup once and
    // reuses it, which is what React does through a stable root, and the test
    // compares node identity across the switch one for one.
    const fake = createFakeDom()
    const controller = createPanelController(fakeIo({ '/w': [src, a] }))
    let built = false
    const treeRenderer: PanelRenderer<FakeNode> = (container) => {
      if (built)
        return
      built = true
      const filter = fake.document.createElement('div')
      const scroller = fake.document.createElement('div')
      scroller.setAttribute('data-dsh-tweaks-file-panel-scroll', '')
      const list = fake.document.createElement('ul')
      for (const path of ['/w/src', '/w/a.ts']) {
        const row = fake.document.createElement('li')
        row.setAttribute('data-dsh-tweaks-files-path', path)
        list.appendChild(row)
      }
      scroller.appendChild(list)
      container.appendChild(filter)
      container.appendChild(scroller)
    }
    const mount = createPanelMount<FakeNode>({
      dom: fakeHostDom(fake),
      controller,
      render: treeRenderer,
      storage: { getItem: () => null, setItem: () => {} },
    })
    const body = bodyMaker(fake)

    mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    mount.dockInto(body('files'), 'page')
    await settle()
    // Every node in the subtree, in document order, the container included.
    const before = [mount.container(), ...mount.container().descendants()]
    expect(before.length).toBeGreaterThan(3)

    mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('a.ts'), kind: 'text' })
    mount.dockInto(body('file-1'), 'dock')
    await settle()
    const after = [mount.container(), ...mount.container().descendants()]

    expect(after).toHaveLength(before.length)
    for (const [index, node] of after.entries())
      expect(node).toBe(before[index])
    mount.dispose()
  })

  it('keeps expansion, loaded levels, the filter and the offset across a tab switch', async () => {
    const h = await mount({ '/w': [src, a], '/w/src': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    h.controller.toggle('/w/src')
    h.controller.setFilter('a')
    h.controller.setScroll(120)
    await settle()

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()

    const state = h.controller.state()
    expect(state.expanded).toContain('/w/src')
    expect(state.levels['/w/src']).toBeDefined()
    expect(state.filter).toBe('a')
    expect(state.scrollTop).toBe(120)
  })

  it('leaves the page for a tab it has no home in, without losing anything', async () => {
    const h = await mount({ '/w': [a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    const container = h.mount.container()

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'guide', kind: 'guide' })
    expect(h.mount.host()).toBeUndefined()
    expect(container.parentNode).toBeUndefined()
    // Off the page, still one node with its state.
    expect(h.mount.container()).toBe(container)
    expect(h.controller.state().root).toBe('/w')
  })

  it('takes the whole tab for the file list and docks beside a file', async () => {
    const h = await mount({ '/w': [a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    expect(h.mount.container().parentNode?.getAttribute(PANEL_HOST_ATTRIBUTE)).toBe('page')

    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    expect(h.mount.container().parentNode?.getAttribute(PANEL_HOST_ATTRIBUTE)).toBe('dock')
  })

  it('moves the panel when the shell offers a new body element for the next tab', async () => {
    const h = await mount({ '/w': [a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-2'), 'dock')
    await settle()
    expect(h.mount.container().parentNode?.getAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name)).toBe('file-2')
  })

  it('reports every view with the panel\'s whole state, so the renderer can draw the tree', async () => {
    const h = await mount({ '/w': [src, a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    const last = h.views.at(-1)!
    expect(last.docked).toBe(false)
    expect(last.state.root).toBe('/w')
    expect(last.state.expanded).toEqual(['/w'])
  })

  it('re-reads the tree from a different workspace rather than showing the old one', async () => {
    const h = await mount({ '/w': [a], '/other': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/other', address: 'files', kind: 'files' })
    await settle()
    expect(h.views.at(-1)!.state.root).toBe('/other')
    expect(h.controller.levelOf('/other')?.kind).toBe('ready')
  })
})

describe('revealing the active file', () => {
  it('reveals the active file once its chain has settled', async () => {
    const h = await mount({ '/w': [src], '/w/src': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/b.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    expect(h.revealed).toEqual(['/w/src/b.ts'])
  })

  it('does not reveal again for the same activation, so a refresh cannot move the reader', async () => {
    const h = await mount({ '/w': [src], '/w/src': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/b.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    const count = h.revealed.length

    // The same tab reported again, and a state change for good measure.
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/b.ts'), kind: 'text' })
    h.controller.setScroll(200)
    await settle()
    expect(h.revealed).toHaveLength(count)
  })

  it('reveals when the activation changes to another file', async () => {
    const h = await mount({ '/w': [src], '/w/src': [a, b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/b.ts'), kind: 'text' })
    await settle()
    expect(h.revealed).toEqual(['/w/src/a.ts', '/w/src/b.ts'])
  })

  it('clears the mark and reveals nothing when a non-file tab is on screen', async () => {
    const h = await mount({ '/w': [src], '/w/src': [a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: fileAddress('src/a.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    h.revealed.length = 0
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'guide', kind: 'guide' })
    await settle()
    expect(h.controller.state().active).toBeUndefined()
    expect(h.mount.host()).toBeUndefined()
    expect(h.revealed).toEqual([])
  })
})

/**
 * The reveal when the renderer commits *later*, which is the shape React 18 puts
 * the real one in.
 *
 * The rest of this file mounts a renderer that draws and signals its commit in
 * the same call, and every claim it makes about reveal timing is true of that
 * shape and only that shape. What `createRoot().render()` performs is a *request*
 * rather than a commit, and the rows arrive when React performs it. So the two
 * moments are driven apart by hand here (`render` records what to draw, and the
 * test performs the draw later, exactly as React would), and the claim is that
 * the reveal still happens.
 *
 * That a reveal issued between the two moments finds nothing is not a bug to
 * assert; it is the premise. The row is genuinely not in the DOM yet. What is
 * under test is what the mount does with that: it must keep the request and run
 * it at the commit, rather than write the activation off as revealed and never
 * look again.
 */
describe('revealing when the renderer commits later', () => {
  /** The address of one file in session `s1`, rooted at `/w`. */
  const address = (path: string): string => `dsh-resource://file/session/s1/${path}`

  /**
   * A mount whose renderer defers its draw, and the handle that performs it.
   *
   * The deferred draw really does put rows in the DOM: it records exactly the
   * paths the view would render (`visibleRows`, the same flattening the real
   * view uses), and `reveal` answers from that record the way `revealRow`'s
   * `querySelector` answers from the document.
   * @param levels - what each directory lists.
   * @returns the mount, its bodies, the revealed keys and the commit handle.
   */
  function lateRenderMount(levels: Record<string, { name: string, type: 'file' | 'directory' | 'other' }[]>) {
    const fake = createFakeDom()
    const controller = createPanelController(fakeIo(levels))
    /** Perform the draw the renderer last requested, or undefined when none is. */
    let awaitingDraw: (() => void) | undefined
    /** The paths the committed DOM holds. */
    const drawn = new Set<string>()
    const revealed: string[] = []
    let mount: PanelMount<FakeNode> | undefined

    const render: PanelRenderer<FakeNode> = (_container, view) => {
      // `render` only *requests* a commit; the rows are not in the DOM until the
      // test performs it, which is the whole point of this shape.
      awaitingDraw = () => {
        drawn.clear()
        if (view.state.root !== undefined) {
          for (const row of visibleRows(view.state.root, view.state.levels, view.state.expanded, view.state.filter))
            drawn.add(row.path)
        }
        // The view's ref callback, which is how React reports the commit.
        mount?.onRendered()
      }
    }
    mount = createPanelMount<FakeNode>({
      dom: fakeHostDom(fake),
      controller,
      render,
      // Answers from the drawn rows, like `revealRow`'s query does.
      reveal: (_container, path) => {
        if (!drawn.has(path))
          return 'absent'
        revealed.push(path)
        return 'centred'
      },
      storage: { getItem: () => null, setItem: () => {} },
    })
    const body = bodyMaker(fake)

    return {
      mount,
      body,
      revealed,
      /** Perform the draw the renderer deferred, as React's commit would. */
      commit(): void {
        const work = awaitingDraw
        awaitingDraw = undefined
        work?.()
      },
      /** Whether a draw is waiting to be committed. */
      pendingDraw: (): boolean => awaitingDraw !== undefined,
    }
  }

  it('reveals at the commit, after a synchronous attempt would have found nothing', async () => {
    const h = lateRenderMount({ '/w': [src], '/w/src': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: address('src/b.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()

    // The chain has settled and the renderer has been asked to draw, but the
    // commit has not run, so the row is not in the DOM: there is nothing to
    // reveal yet, and the mount must not treat the activation as done.
    expect(h.pendingDraw()).toBe(true)
    expect(h.revealed).toEqual([])

    h.commit()
    // The commit carries the row, and the reveal runs there. A mount that had
    // attempted the reveal when it decided to would have found nothing, written
    // the activation off, and left the reader where they were.
    expect(h.revealed).toEqual(['/w/src/b.ts'])
  })

  it('retries at the next commit when the row is still not drawn', async () => {
    const h = lateRenderMount({ '/w': [src], '/w/src': [b] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: address('src/b.ts'), kind: 'text' })
    h.mount.dockInto(h.body('file-1'), 'dock')
    await settle()
    expect(h.pendingDraw()).toBe(true)

    // A commit in which the row is not there (the filter hides it, or the level
    // landed after this draw was requested). The request must survive it.
    h.revealed.length = 0
    h.mount.onRendered()
    expect(h.revealed).toEqual([])

    // The commit that does carry the row reveals.
    h.commit()
    expect(h.revealed).toEqual(['/w/src/b.ts'])
  })
})

describe('the visibility preference', () => {
  it('is on by default and remembers being turned off', async () => {
    const h = await mount()
    expect(h.mount.enabled()).toBe(true)
    h.mount.setEnabled(false)
    expect(h.mount.enabled()).toBe(false)
    expect(h.written).toEqual(['false'])
  })
})

describe('unload', () => {
  it('takes the container off the page and clears every marker and subscription', async () => {
    const h = await mount({ '/w': [a] })
    const filesBody = h.body('files')
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(filesBody, 'page')
    await settle()
    const container = h.mount.container()

    h.mount.dispose()
    expect(h.mount.host()).toBeUndefined()
    expect(container.parentNode).toBeUndefined()
    expect(filesBody.getAttribute(PANEL_HOST_ATTRIBUTE)).toBeNull()
    expect([...filesBody.children]).toEqual([])
    expect(h.controller.watched()).toEqual([])
  })

  it('stops redrawing after it was released, even if the controller is poked', async () => {
    const h = await mount({ '/w': [a] })
    h.mount.show({ sessionId: sessionId('s1'), workspaceRoot: '/w', address: 'files', kind: 'files' })
    h.mount.dockInto(h.body('files'), 'page')
    await settle()
    h.mount.dispose()
    const drawn = h.views.length
    // A disposed controller has no state left to change, and the mount's own
    // subscription is gone: nothing can reach the renderer any more.
    h.controller.setFilter('a')
    h.controller.setScroll(50)
    expect(h.views).toHaveLength(drawn)
  })
})
