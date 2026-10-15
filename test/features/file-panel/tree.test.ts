/**
 * The tree's pure half, exercised through its public functions.
 *
 * The ordering cases come from the built-in tree's own expectations: the panel
 * replaces that tree, so a different order would be a visible regression even
 * though nothing throws.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/file-panel/tree
 */

import { describe, expect, it } from 'vitest'
import {
  childPath,
  filterEntries,
  matchFilter,
  nestRows,
  orderEntries,
  pruneExpansion,
  visibleRows,
} from '../../../src/client/features/file-panel/tree.ts'

describe('orderEntries', () => {
  it('puts directories first, then everything else, each group naturally by name', () => {
    const ordered = orderEntries([
      { name: 'file10.txt', type: 'file' },
      { name: 'zeta', type: 'directory' },
      { name: 'file2.txt', type: 'file' },
      { name: '.env', type: 'file' },
      { name: 'Alpha', type: 'directory' },
      { name: 'sock', type: 'other' },
    ])
    expect(ordered.map(entry => entry.name)).toEqual(['Alpha', 'zeta', '.env', 'file2.txt', 'file10.txt', 'sock'])
  })

  it('does not mutate the listing it was given', () => {
    const entries = [{ name: 'b', type: 'file' as const }, { name: 'a', type: 'directory' as const }]
    orderEntries(entries)
    expect(entries.map(entry => entry.name)).toEqual(['b', 'a'])
  })
})

describe('matchFilter', () => {
  it('matches case-insensitively anywhere in the name', () => {
    expect(matchFilter('Button.tsx', 'butt')).toBe(true)
    expect(matchFilter('Button.tsx', 'TSX')).toBe(true)
  })

  it('matches everything when the filter is blank or only whitespace', () => {
    expect(matchFilter('anything', '')).toBe(true)
    expect(matchFilter('anything', '   ')).toBe(true)
  })

  it('rejects a name that does not contain the filter', () => {
    expect(matchFilter('Button.tsx', 'input')).toBe(false)
  })
})

describe('filterEntries', () => {
  it('keeps matching entries in their original order', () => {
    const entries = [
      { name: 'src', type: 'directory' as const },
      { name: 'README.md', type: 'file' as const },
      { name: 'srt.txt', type: 'file' as const },
    ]
    expect(filterEntries(entries, 'sr').map(entry => entry.name)).toEqual(['src', 'srt.txt'])
  })
})

describe('childPath', () => {
  it('joins with one separator whatever the parent ends in', () => {
    expect(childPath('/w', 'a')).toBe('/w/a')
    expect(childPath('/w/', 'a')).toBe('/w/a')
    expect(childPath('/w//', 'a')).toBe('/w/a')
  })
})

describe('pruneExpansion', () => {
  it('forgets levels and expansion marks of directories that vanished', () => {
    const levels = { '/w': {}, '/w/gone': {}, '/w/kept': {}, '/other/x': {} }
    const result = pruneExpansion(['/w', '/w/gone', '/w/kept'], levels, '/w', [
      { name: 'kept', type: 'directory' },
      { name: 'a.txt', type: 'file' },
    ])
    expect(result.expanded).toEqual(['/w', '/w/kept'])
    expect(result.removed).toEqual(['/w/gone'])
  })

  it('never prunes the parent itself or anything outside it', () => {
    const result = pruneExpansion(['/w', '/other'], { '/w': {}, '/other': {} }, '/w', [])
    expect(result.removed).toEqual([])
    expect(result.expanded).toEqual(['/w', '/other'])
  })

  it('treats a name-prefix sibling as unrelated', () => {
    const result = pruneExpansion(['/w/srcx'], { '/w/srcx': {} }, '/w', [])
    expect(result.removed).toEqual(['/w/srcx'])
  })
})

describe('visibleRows', () => {
  const levels = {
    '/w': { kind: 'ready' as const, entries: [{ name: 'src', type: 'directory' as const }, { name: 'a.txt', type: 'file' as const }] },
    '/w/src': { kind: 'ready' as const, entries: [{ name: 'b.ts', type: 'file' as const }] },
  }

  it('lists only the root when nothing is expanded', () => {
    expect(visibleRows('/w', levels, ['/w']).map(row => row.path)).toEqual(['/w/src', '/w/a.txt'])
  })

  it('descends into an expanded directory and reports the depth', () => {
    const rows = visibleRows('/w', levels, ['/w', '/w/src'])
    expect(rows.map(row => [row.path, row.depth])).toEqual([['/w/src', 0], ['/w/src/b.ts', 1], ['/w/a.txt', 0]])
  })

  it('keeps an expanded directory with no cached level visible as loading', () => {
    const rows = visibleRows('/w', levels, ['/w', '/w/src'])
    expect(rows.every(row => row.path !== '/w/src')).toBe(false)
  })

  it('reveals a match under a collapsed directory through its ancestors', () => {
    // `src` does not match, but it is what leads to `b.ts`, so hiding it would
    // make the match unreachable.
    const rows = visibleRows('/w', levels, ['/w'], 'b')
    expect(rows.map(row => [row.path, row.depth])).toEqual([['/w/src', 0], ['/w/src/b.ts', 1]])
  })

  it('keeps a directory whose own name matches, even with no cached level', () => {
    const rows = visibleRows('/w', levels, ['/w'], 'src')
    expect(rows.map(row => row.path)).toEqual(['/w/src'])
  })

  it('reports one empty note rather than one per level when nothing matches', () => {
    const rows = visibleRows('/w', levels, ['/w'], 'zzz')
    expect(rows.map(row => row.kind === 'note' ? row.note : row.kind)).toEqual(['empty'])
  })

  it('does not need the directory to be expanded to search within it', () => {
    const rows = visibleRows('/w', levels, [], 'b.ts')
    expect(rows.map(row => row.path)).toEqual(['/w/src', '/w/src/b.ts'])
  })

  it('reports a failed level as a note instead of dropping it', () => {
    const rows = visibleRows('/w', { '/w': { kind: 'failed' as const, entries: [] } }, ['/w'])
    expect(rows).toEqual([{ kind: 'note', path: '/w', depth: 0, note: 'failed', failure: undefined }])
  })

  it('keeps the entries and adds the failure note when a refresh failed', () => {
    const rows = visibleRows('/w', {
      '/w': { kind: 'ready' as const, entries: [{ name: 'a.txt', type: 'file' as const }], failure: { code: 'gateway/internal' } },
    }, ['/w'])
    expect(rows.map(row => row.kind)).toEqual(['note', 'file'])
  })

  it('notes an empty directory and a truncated listing', () => {
    const rows = visibleRows('/w', {
      '/w': { kind: 'ready' as const, entries: [], truncated: true },
    }, ['/w'])
    expect(rows.map(row => row.kind === 'note' ? row.note : row.kind)).toEqual(['empty', 'truncated'])
  })
})

describe('nestRows', () => {
  const levels = {
    '/w': { kind: 'ready' as const, entries: [{ name: 'src', type: 'directory' as const }, { name: 'a.txt', type: 'file' as const }] },
    '/w/src': { kind: 'ready' as const, entries: [{ name: 'deep', type: 'directory' as const }] },
    '/w/src/deep': { kind: 'ready' as const, entries: [{ name: 'b.ts', type: 'file' as const }] },
  }

  it('nests each expanded level under its own directory row', () => {
    const rows = visibleRows('/w', levels, ['/w', '/w/src', '/w/src/deep'])
    const roots = nestRows(rows)
    expect(roots.map(node => node.row.path)).toEqual(['/w/src', '/w/a.txt'])
    const src = roots[0]!
    expect(src.children.map(node => node.row.path)).toEqual(['/w/src/deep'])
    expect(src.children[0]!.children.map(node => node.row.path)).toEqual(['/w/src/deep/b.ts'])
  })

  it('leaves a level note as a sibling of the rows it describes', () => {
    const rows = visibleRows('/w', { '/w': { kind: 'ready' as const, entries: [], truncated: true } }, ['/w'])
    const roots = nestRows(rows)
    expect(roots).toHaveLength(2)
    expect(roots.every(node => node.children.length === 0)).toBe(true)
  })

  it('rebuilds the same shape when a level goes away and comes back', () => {
    const rows = visibleRows('/w', levels, ['/w', '/w/src'])
    expect(nestRows(rows).map(node => node.key)).toEqual(nestRows([...rows]).map(node => node.key))
  })

  it('produces a key unique within one render, so sibling rows of one file name do not collide', () => {
    const rows = visibleRows('/w', {
      '/w': { kind: 'ready' as const, entries: [{ name: 'x', type: 'directory' as const }] },
      '/w/x': { kind: 'ready' as const, entries: [{ name: 'y', type: 'directory' as const }] },
    }, ['/w', '/w/x'])
    const keys = nestRows(rows).flatMap(function walk(node): string[] {
      return [node.key, ...node.children.flatMap(walk)]
    })
    expect(new Set(keys).size).toBe(keys.length)
  })
})
