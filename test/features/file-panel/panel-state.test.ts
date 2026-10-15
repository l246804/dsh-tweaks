/**
 * The panel's state transitions, checked as behaviour a reader can see.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/panel-state
 */

import { describe, expect, it } from 'vitest'
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
} from '../../../src/client/features/file-panel/panel-state.ts'

const a = { name: 'a.ts', type: 'file' as const }
const src = { name: 'src', type: 'directory' as const }
const nested = { name: 'nested', type: 'directory' as const }

describe('withRoot', () => {
  it('opens the root as the only expanded directory', () => {
    const state = withRoot(createPanelState(true), '/w')
    expect(state.root).toBe('/w')
    expect(state.expanded).toEqual(['/w'])
  })

  it('keeps everything when the root does not change', () => {
    const opened = levelLoaded(withRoot(createPanelState(true), '/w'), '/w', [a], false)
    expect(withRoot(opened, '/w')).toBe(opened)
  })

  it('starts over for a different workspace, because it is a different tree', () => {
    const opened = levelLoaded(withRoot(createPanelState(true), '/w'), '/w', [a], false)
    const moved = withRoot(opened, '/other')
    expect(moved.levels).toEqual({})
    expect(moved.expanded).toEqual(['/other'])
  })
})

describe('levels', () => {
  it('does not flash a loading state over rows that are already loaded', () => {
    const loaded = levelLoaded(createPanelState(true), '/w', [a], false)
    expect(levelLoading(loaded, '/w')).toBe(loaded)
  })

  it('does load a directory with no rows yet', () => {
    expect(levelLoading(createPanelState(true), '/w').levels['/w']).toEqual({ kind: 'loading' })
  })

  it('keeps the old rows when a refresh fails, and reports the failure beside them', () => {
    const loaded = levelLoaded(createPanelState(true), '/w', [a], false)
    const failed = levelFailed(loaded, '/w', { code: 'gateway/internal' })
    expect(failed.levels['/w']).toEqual({ kind: 'ready', entries: [a], truncated: false, failure: { code: 'gateway/internal' } })
  })

  it('reports a failure as a failed level when there were no rows to keep', () => {
    const state = levelFailed(levelLoading(createPanelState(true), '/w'), '/w', { code: 'workspace-file/not-found' })
    expect(state.levels['/w']).toEqual({ kind: 'failed', failure: { code: 'workspace-file/not-found' } })
  })

  it('forgets a vanished subdirectory, its expansion and its rows', () => {
    let state = withRoot(createPanelState(true), '/w')
    state = levelLoaded(state, '/w', [src], false)
    state = levelLoaded(state, '/w/src', [nested], false)
    state = toggleExpanded(state, '/w/src')
    const reloaded = levelLoaded(state, '/w', [a], false)
    expect(reloaded.expanded).toEqual(['/w'])
    expect(reloaded.levels['/w/src']).toBeUndefined()
  })
})

describe('toggleExpanded', () => {
  it('keeps the loaded rows when a directory is collapsed, so reopening is instant', () => {
    let state = levelLoaded(createPanelState(true), '/w', [src], false)
    state = toggleExpanded(state, '/w/src')
    state = levelLoaded(state, '/w/src', [a], false)
    const collapsed = toggleExpanded(state, '/w/src')
    expect(collapsed.expanded).not.toContain('/w/src')
    expect(collapsed.levels['/w/src']).toEqual({ kind: 'ready', entries: [a], truncated: false })
  })

  it('forgets a failed listing on collapse, so reopening reads it again', () => {
    let state = toggleExpanded(createPanelState(true), '/w/src')
    state = levelFailed(state, '/w/src', { code: 'gateway/internal' })
    expect(toggleExpanded(state, '/w/src').levels['/w/src']).toBeUndefined()
  })
})

describe('the small setters', () => {
  it('replaces the filter, the offset, the flag and the active row', () => {
    const state = createPanelState(true)
    expect(setFilter(state, 'a').filter).toBe('a')
    expect(setScroll(state, 40).scrollTop).toBe(40)
    expect(setEnabled(state, false).enabled).toBe(false)
    expect(setActive(state, '/w/a.ts').active).toBe('/w/a.ts')
    expect(setActive(state, '/w/a.ts').active).not.toBeUndefined()
  })

  it('returns the same state when nothing changed, so a renderer can skip work', () => {
    const state = setActive(createPanelState(true), '/w/a.ts')
    expect(setFilter(state, '')).toBe(state)
    expect(setScroll(state, 0)).toBe(state)
    expect(setEnabled(state, true)).toBe(state)
    expect(setActive(state, '/w/a.ts')).toBe(state)
  })
})
