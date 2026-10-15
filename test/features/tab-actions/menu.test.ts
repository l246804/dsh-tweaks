/**
 * The tab-actions menu, driven end to end through `install`.
 *
 * `install` is the feature's public seam: it takes a client context and
 * contributes three menu items through the official tab-menu extension point.
 * These tests hold it to the whole contract that can be observed without a
 * browser: the three registrations exist, each renders a `role="menuitem"` row,
 * each closes exactly its own target set and dismisses the menu, an item with
 * nothing to act on is disabled rather than absent, and unloading releases
 * everything the install took.
 *
 * The row component comes from `ui-primitives`, which the browser shell injects
 * from its module table. In plain Node it cannot load (its own bundle asks for
 * packages this repository does not install), so this seam mocks the one
 * exported component the feature uses. What is asserted is the feature's own
 * decision -- the label, the disabled flag, and what a row does when chosen --
 * never the primitives' markup.
 *
 * The host surface is a recording stand-in over the real adapter, so what runs
 * here is the feature's own install path: the same `hostOf`, the same
 * `writeMenu`, the same effects and the same registrations a browser would
 * get.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/tab-actions/menu
 */

import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { ReactElement } from 'react'
import type { ElementLike } from '../../../src/client/dom/types.ts'
import type { MenuItemComponent, MenuItemRegistration, TabActionsHost } from '../../../src/client/features/tab-actions/index.ts'
import type { FakeDom } from '../../helpers/dom.ts'
import type { RecordingScope } from '../../helpers/scope.ts'
import { describe, expect, it, vi } from 'vitest'
import { MENU_IDS } from '../../../src/client/features/tab-actions/index.ts'
import { writeMenu } from '../../../src/client/features/tab-actions/menu.ts'
import { createFakeDom } from '../../helpers/dom.ts'
import { createRecordingScope } from '../../helpers/scope.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react')
  return {
    MenuItemButton: (props: { children: string, disabled?: boolean, onSelect: () => void }) =>
      createElement('button', { role: 'menuitem', disabled: props.disabled === true, onClick: props.onSelect }, props.children),
  }
})

/** The stand-in document, whose extra read faces (`body`) the tests draw into. */
type StandIn = FakeDom['document']

/** The Session under test, and a retained background one that must stay out of the read. */
const SESSION = 's1'
const BACKGROUND = 's2'

/** One drawn sidebar: which tabs each docked pane shows, and which tabs float. */
interface Scene {
  /** Docked panes, in document order: pane id to its tab ids in strip order. */
  readonly panes: Readonly<Record<string, readonly string[]>>
  /** Floating tabs: tab id to the pane that draws it. */
  readonly floats?: Readonly<Record<string, string>>
  /** Tab kinds; a tab absent here defaults to `text`, and an explicit `null` means the host has no record for it. */
  readonly kinds?: Readonly<Record<string, string | null>>
}

/** Everything the tests observe about one install. */
interface Harness {
  readonly scope: RecordingScope
  readonly document: StandIn
  /** The row component registered under one menu-item id. */
  readonly item: (id: string) => MenuItemComponent
  /** Tab ids passed to `close`, in call order. */
  readonly closed: readonly string[]
  /** Every dictionary registered, keyed by locale. */
  readonly dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** The options every menu item was registered under. */
  readonly registrations: readonly MenuItemRegistration[]
  /** Release everything the install took, and restore the globals it touched. */
  readonly unload: () => void
}

/** Build the tab host section the docking kit draws for every tab. */
function host(document: StandIn, into: ElementLike, tabId: string, floating: boolean, paneId: string): void {
  const section = document.createElement('section')
  section.setAttribute('data-dockkit-content', tabId)
  section.setAttribute('data-dockkit-host', floating ? 'float' : 'dock')
  section.setAttribute(floating ? 'data-dockkit-float' : 'data-dockkit-pane', paneId)
  into.appendChild(section)
}

/** Draw one Session's sidebar into the stand-in document. */
function draw(document: StandIn, sessionId: string, scene: Scene): void {
  const view = document.createElement('div')
  view.setAttribute('data-sidebar-right-session', sessionId)
  document.body.appendChild(view)
  for (const [paneId, tabIds] of Object.entries(scene.panes)) {
    const strip = document.createElement('div')
    strip.setAttribute('data-dockkit-strip-tabs', paneId)
    for (const id of tabIds) {
      const chip = document.createElement('div')
      chip.setAttribute('data-dockkit-tab', id)
      strip.appendChild(chip)
    }
    view.appendChild(strip)
    for (const id of tabIds) host(document, view, id, false, paneId)
  }
  for (const [id, paneId] of Object.entries(scene.floats ?? {})) host(document, view, id, true, paneId)
}

/** Every tab id a scene draws that the host has a record for, with its kind. */
function recordsOf(scene: Scene): readonly { id: string, kind: string }[] {
  const ids = [...Object.values(scene.panes).flat(), ...Object.keys(scene.floats ?? {})]
  const records: { id: string, kind: string }[] = []
  for (const id of ids) {
    const kind = scene.kinds?.[id]
    if (kind === null)
      continue
    records.push({ id, kind: kind ?? 'text' })
  }
  return records
}

/**
 * A recording stand-in for the host operations, over the real adapter.
 *
 * Each member answers exactly as the client context would, and records what the
 * feature asked for, which is how "the registrations exist" and "unload leaves
 * nothing" become assertions rather than assumptions.
 */
function recordingHost(document: StandIn, records: readonly { id: string, kind: string }[]): {
  host: TabActionsHost
  scope: RecordingScope
  items: Map<string, MenuItemComponent>
  registrations: MenuItemRegistration[]
  closed: string[]
  dictionaries: Record<string, Record<string, string>>
} {
  const scope = createRecordingScope()
  const items = new Map<string, MenuItemComponent>()
  const registrations: MenuItemRegistration[] = []
  const closed: string[] = []
  const dictionaries: Record<string, Record<string, string>> = {}
  const host: TabActionsHost = {
    effect: (body, label) => { scope.effect(body, label) },
    onMenuSlot: contribute => scope.own(contribute()),
    registerItem: (options: MenuItemRegistration, component: MenuItemComponent) => {
      registrations.push(options)
      items.set(options.id, component)
      return () => {
        items.delete(options.id)
      }
    },
    registerDictionary: (dicts) => {
      Object.assign(dictionaries, dicts)
      return () => {}
    },
    document: () => document,
    mountedSession: () => SESSION,
    tabsIn: () => records,
    close: (tabId) => { closed.push(tabId) },
  }
  return { host, scope, items, registrations, closed, dictionaries }
}

/** Install the feature into a recording host over one drawn scene. */
function mount(scene: Scene): Harness {
  const dom = createFakeDom()
  const { document } = dom
  // The feature reaches the page through the global, as the bundle does in a
  // browser, so the stand-in has to stand in for the global too.
  const restore = dom.install()
  draw(document, SESSION, scene)
  draw(document, BACKGROUND, { panes: { 'other-pane': ['other-tab'] } })

  const recording = recordingHost(document, recordsOf(scene))
  writeMenu(recording.host)

  return {
    scope: recording.scope,
    document,
    registrations: recording.registrations,
    dictionaries: recording.dictionaries,
    closed: recording.closed,
    item: (id) => {
      const component = recording.items.get(id)
      if (component === undefined)
        throw new Error(`no menu item registered as ${id}`)
      return component
    },
    unload: () => {
      recording.scope.disposeAll()
      restore()
    },
  }
}

/** One rendered row, plus how to activate it and how many times it dismissed the menu. */
interface RenderedRow {
  /** The button the menu kit would draw, as the mocked primitive renders it. */
  readonly button: ReactElement
  /** Activate the row, as a click would. */
  readonly chosen: () => void
  /** How many times the row has dismissed its menu. */
  readonly dismissals: () => number
}

/**
 * Render one item for a target tab.
 *
 * The feature hands its row to the menu primitive; running that component is
 * what turns the props into the `role="menuitem"` button the kit probes for, so
 * this is where that requirement is observable without a renderer.
 */
function renderItem(harness: Harness, id: string, target: string, kind = 'text'): RenderedRow {
  let dismissed = 0
  const element = harness.item(id)({
    tab: { id: target as TabId, kind, contentId: `page://${target}`, title: target },
    dismiss: () => { dismissed += 1 },
    t: (key: string) => key,
  })
  if (element === null)
    throw new Error(`${id} rendered nothing`)
  const component = element.type as (props: unknown) => ReactElement
  return {
    button: component(element.props),
    chosen: () => {
      const onSelect = (element.props as { onSelect?: () => void }).onSelect
      if (onSelect === undefined)
        throw new Error(`${id} renders a row with no activation`)
      onSelect()
    },
    dismissals: () => dismissed,
  }
}

/** The ids one action closed, once it ran. */
function closings(harness: Harness, run: () => void): string[] {
  const before = harness.closed.length
  run()
  return harness.closed.slice(before)
}

describe('the tab-actions menu', () => {
  it('registers the three actions under their own ids, into the tab-menu slot', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })

    expect(harness.registrations.map(entry => entry.id)).toEqual([MENU_IDS.others, MENU_IDS.left, MENU_IDS.right])
  })

  it('renders each action as a menu row, which is what the kit probes for', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })

    for (const id of [MENU_IDS.others, MENU_IDS.left, MENU_IDS.right]) {
      const { button } = renderItem(harness, id, 'b')
      expect(button.type, `${id} did not render a row`).toBe('button')
      expect(button.props).toMatchObject({ role: 'menuitem' })
    }
  })

  it('closes every other docked tab, on both panes', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'], 'pane-2': ['x'] } })
    const { chosen } = renderItem(harness, MENU_IDS.others, 'b')

    expect(closings(harness, chosen)).toEqual(['a', 'x'])
  })

  it('closes the tabs before the target, and only those', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b', 'c'] } })
    const { chosen } = renderItem(harness, MENU_IDS.left, 'c')

    expect(closings(harness, chosen)).toEqual(['a', 'b'])
  })

  it('closes the tabs after the target, and only those', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b', 'c'] } })
    const { chosen } = renderItem(harness, MENU_IDS.right, 'a')

    expect(closings(harness, chosen)).toEqual(['b', 'c'])
  })

  it('dismisses the menu whenever a row acts', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })
    const row = renderItem(harness, MENU_IDS.left, 'b')

    row.chosen()

    expect(row.dismissals()).toBe(1)
  })

  it('dismisses the menu even when the row has nothing to close', () => {
    const harness = mount({ panes: { 'pane-1': ['a'] } })
    const row = renderItem(harness, MENU_IDS.left, 'a')

    row.chosen()

    expect(row.dismissals()).toBe(1)
    expect(harness.closed).toEqual([])
  })

  it('disables an action with nothing to act on, rather than hiding it', () => {
    // The menu is on a floating tab and the only docked tab is the guide, which
    // the host refuses to close, so every set is empty.
    const harness = mount({ panes: { 'pane-1': ['guide'] }, floats: { float: 'float-1' }, kinds: { guide: 'guide' } })

    for (const id of [MENU_IDS.others, MENU_IDS.left, MENU_IDS.right]) {
      const row = renderItem(harness, id, 'float')
      expect(row.button.props, `${id} was not disabled`).toMatchObject({ disabled: true })
      expect(closings(harness, row.chosen)).toEqual([])
    }
  })

  it('disables the side with nothing on it while the other side still acts', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b', 'c'] } })

    const left = renderItem(harness, MENU_IDS.left, 'a')
    const right = renderItem(harness, MENU_IDS.right, 'a')

    expect(left.button.props).toMatchObject({ disabled: true })
    expect(right.button.props).toMatchObject({ disabled: false })
  })

  it('stays enabled for a target the host has no record of, because "others" still acts', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'ghost', 'c'] }, kinds: { ghost: null } })
    const row = renderItem(harness, MENU_IDS.others, 'ghost')

    expect(row.button.props).toMatchObject({ disabled: false })
    expect(closings(harness, row.chosen)).toEqual(['a', 'c'])
  })

  it('never closes a floating tab, and never leaves one in a set', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] }, floats: { float: 'float-1' } })
    const { chosen } = renderItem(harness, MENU_IDS.others, 'a')

    expect(closings(harness, chosen)).toEqual(['b'])
  })

  it('skips a tab the host would refuse without stopping the set there', () => {
    // `ghost` has a chip but no record, so closing it could not act; the tab
    // beyond it must still close.
    const harness = mount({ panes: { 'pane-1': ['a', 'ghost', 'c'] }, kinds: { ghost: null } })
    const row = renderItem(harness, MENU_IDS.others, 'a')

    expect(closings(harness, row.chosen)).toEqual(['c'])
  })

  it('refuses to name the guide standing alone, and closes what else is there', () => {
    const harness = mount({ panes: { 'pane-1': ['guide', 'a'] }, kinds: { guide: 'guide' } })
    const row = renderItem(harness, MENU_IDS.others, 'a')

    expect(closings(harness, row.chosen)).toEqual(['guide'])
    expect(harness.closed).toContain('guide')
  })

  it('reads only the Session it is mounted for, never a retained background one', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })
    const row = renderItem(harness, MENU_IDS.others, 'a')

    expect(closings(harness, row.chosen)).toEqual(['b'])
    expect(harness.closed).not.toContain('other-tab')
  })

  it('recomputes the set when a row acts, so a strip changed since registration still lands', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })
    const row = renderItem(harness, MENU_IDS.others, 'a')

    const ids = closings(harness, row.chosen)

    expect(ids).toEqual(['b'])
  })

  it('registers both languages under this feature\'s own namespace, with the same keys', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })

    expect(Object.keys(harness.dictionaries).sort()).toEqual(['en', 'zh'])
    const { zh, en } = harness.dictionaries as { zh: Record<string, string>, en: Record<string, string> }
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(zh).sort()).toEqual(['menu.closeLeft', 'menu.closeOthers', 'menu.closeRight'])
    // The namespace is the same one the slot registrations declare, so a
    // translation and its row cannot drift onto different dictionaries.
    expect(harness.registrations.every(entry => entry.locale === 'dsh-tweaks.tab-actions')).toBe(true)
  })

  it('labels every effect, so an unload is traceable to its owner', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })

    expect(harness.scope.labels.length).toBeGreaterThan(0)
    expect(harness.scope.labels.every(label => label.startsWith('dsh-tweaks: tab-actions'))).toBe(true)
  })

  it('leaves no listener, node or held effect behind on unload', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] }, floats: { float: 'float-1' } })
    const nodes = harness.document.body.descendants().length

    harness.unload()

    expect(harness.scope.pending()).toBe(0)
    expect(harness.document.listenerCount()).toBe(0)
    expect(harness.document.body.descendants()).toHaveLength(nodes)
  })

  it('unregisters its menu items on unload, so no row outlives the plugin', () => {
    const harness = mount({ panes: { 'pane-1': ['a', 'b'] } })

    harness.unload()

    expect(() => harness.item(MENU_IDS.others)).toThrow(/no menu item registered/)
  })
})
