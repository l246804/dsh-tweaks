/**
 * Seam one for the tab actions: the close sets, decided from data alone.
 *
 * The three actions are sets this plugin computes and then closes one by one,
 * so the whole decision is a pure function of the strip order, the tab the menu
 * was opened on, and what the host would refuse. These tests state that
 * contract without a document.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/tab-actions/targets
 */

import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { OrderedTab } from '../../../src/client/features/tab-actions/targets.ts'
import { describe, expect, it } from 'vitest'
import { closeTargets, hostClosable } from '../../../src/client/features/tab-actions/targets.ts'

/** One docked tab of pane `pane`. */
function tab(id: string, kind = 'text', pane = 'pane-1'): OrderedTab {
  return { id: id as TabId, kind, host: 'dock', paneId: pane }
}

/** One floating tab: it holds a pane of its own and has no strip position. */
function floated(id: string, kind = 'text', pane = 'float-1'): OrderedTab {
  return { id: id as TabId, kind, host: 'float', paneId: pane }
}

/** The ids of a close set, so a failure reads as a list rather than objects. */
function ids(tabs: readonly OrderedTab[]): string[] {
  return tabs.map(entry => entry.id)
}

/** Every tab closable. */
const open = (): boolean => true

describe('close sets', () => {
  const strip = [tab('a'), tab('b'), tab('c'), tab('d')]

  it('closes every closable tab but the target', () => {
    const sets = closeTargets(strip, 'c' as TabId, open)
    expect(ids(sets.others)).toEqual(['a', 'b', 'd'])
  })

  it('closes the tabs before the target, and only those', () => {
    const sets = closeTargets(strip, 'c' as TabId, open)
    expect(ids(sets.left)).toEqual(['a', 'b'])
  })

  it('closes the tabs after the target, and only those', () => {
    const sets = closeTargets(strip, 'c' as TabId, open)
    expect(ids(sets.right)).toEqual(['d'])
  })

  it('is empty at the edges rather than wrapping around', () => {
    const first = closeTargets(strip, 'a' as TabId, open)
    expect(ids(first.left)).toEqual([])
    expect(ids(first.right)).toEqual(['b', 'c', 'd'])

    const last = closeTargets(strip, 'd' as TabId, open)
    expect(ids(last.left)).toEqual(['a', 'b', 'c'])
    expect(ids(last.right)).toEqual([])
  })

  it('hands back an empty set for a strip holding only the target', () => {
    const sets = closeTargets([tab('only')], 'only' as TabId, open)
    expect(ids(sets.others)).toEqual([])
    expect(ids(sets.left)).toEqual([])
    expect(ids(sets.right)).toEqual([])
  })

  it('skips a tab the host would refuse, leaving the rest of the set intact', () => {
    const sets = closeTargets(strip, 'c' as TabId, entry => entry.id !== 'b')
    expect(ids(sets.others)).toEqual(['a', 'd'])
    expect(ids(sets.left)).toEqual(['a'])
    expect(ids(sets.right)).toEqual(['d'])
  })

  it('is empty everywhere when nothing but the target is closable', () => {
    const sets = closeTargets(strip, 'c' as TabId, entry => entry.id === 'c')
    expect(ids(sets.others)).toEqual([])
    expect(ids(sets.left)).toEqual([])
    expect(ids(sets.right)).toEqual([])
  })

  it('never names a floating tab, wherever it would have stood', () => {
    const mixed = [tab('a'), floated('float'), tab('c')]
    const sets = closeTargets(mixed, 'c' as TabId, open)
    expect(ids(sets.others)).toEqual(['a'])
    expect(ids(sets.left)).toEqual(['a'])
    expect(ids(sets.right)).toEqual([])
  })

  it('gives a floating target no side and no docked tab to spare', () => {
    const mixed = [tab('a'), tab('b'), floated('float')]
    const sets = closeTargets(mixed, 'float' as TabId, open)
    expect(ids(sets.others)).toEqual(['a', 'b'])
    expect(ids(sets.left)).toEqual([])
    expect(ids(sets.right)).toEqual([])
  })

  it('gives a target missing from the order no side either', () => {
    const sets = closeTargets(strip, 'gone' as TabId, open)
    expect(ids(sets.others)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(sets.left)).toEqual([])
    expect(ids(sets.right)).toEqual([])
  })

  it('keeps a side inside the target\'s own pane while "others" spans the surface', () => {
    const twoPanes = [tab('a', 'text', 'pane-1'), tab('b', 'text', 'pane-1'), tab('x', 'text', 'pane-2'), tab('y', 'text', 'pane-2')]
    const sets = closeTargets(twoPanes, 'b' as TabId, open)
    expect(ids(sets.others)).toEqual(['a', 'x', 'y'])
    expect(ids(sets.left)).toEqual(['a'])
    expect(ids(sets.right)).toEqual([])
  })

  it('applies the closability predicate to each action, not once for all three', () => {
    // A tab that only one side would refuse: the other side must still close it.
    const sets = closeTargets(strip, 'c' as TabId, entry => entry.id !== 'a')
    expect(ids(sets.others)).toEqual(['b', 'd'])
    expect(ids(sets.left)).toEqual(['b'])
    expect(ids(sets.right)).toEqual(['d'])
  })
})

describe('the host\'s own closability rule', () => {
  it('refuses the guide standing alone on the docked surface', () => {
    const order = [tab('guide', 'guide')]
    expect(hostClosable(order)(order[0]!)).toBe(false)
  })

  it('allows a guide that shares its pane with another tab', () => {
    const order = [tab('guide', 'guide'), tab('a')]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })

  it('allows a guide alone in its pane while a second docked pane exists', () => {
    const order = [tab('guide', 'guide', 'pane-1'), tab('a', 'text', 'pane-2')]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })

  it('allows every non-guide tab, alone or not', () => {
    const order = [tab('only')]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })

  it('refuses a tab the host has no record of, because closing it cannot act', () => {
    const order: OrderedTab[] = [
      tab('known'),
      { id: 'unknown' as TabId, kind: undefined, host: 'dock', paneId: 'pane-1' },
    ]
    expect(hostClosable(order)(order[1]!)).toBe(false)
  })

  it('refuses a guide whose pane could not be read and nothing else proves another pane', () => {
    // No strip is readable, so the rule cannot establish that a second docked
    // pane exists. Naming a tab the host would refuse cannot close it, and the
    // safe half of an unprovable case is to leave it out of the set.
    const order: OrderedTab[] = [
      { id: 'guide' as TabId, kind: 'guide', host: 'dock', paneId: undefined },
      { id: 'other' as TabId, kind: 'text', host: 'dock', paneId: undefined },
    ]
    expect(hostClosable(order)(order[0]!)).toBe(false)
  })

  it('allows a guide whose own pane is unreadable once another pane is readable', () => {
    // A readable pane id belongs to a rendered strip, and a tab in that strip
    // would carry that pane id. The guide carries none, so it stands in a
    // different pane and cannot be the docked surface's only tab.
    const order: OrderedTab[] = [
      { id: 'guide' as TabId, kind: 'guide', host: 'dock', paneId: undefined },
      tab('elsewhere', 'text', 'pane-2'),
    ]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })

  it('allows a guide alone in a readable pane while a second readable pane exists', () => {
    const order: OrderedTab[] = [tab('guide', 'guide', 'pane-1'), tab('a', 'text', 'pane-2')]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })

  it('allows a readable guide sharing a readable pane, whatever else is unreadable', () => {
    const order: OrderedTab[] = [
      tab('guide', 'guide', 'pane-1'),
      tab('neighbour', 'text', 'pane-1'),
      { id: 'loose' as TabId, kind: 'text', host: 'dock', paneId: undefined },
    ]
    expect(hostClosable(order)(order[0]!)).toBe(true)
  })
})
