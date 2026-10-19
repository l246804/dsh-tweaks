/**
 * The client entry, loaded the way the shell loads it.
 *
 * Every other suite in this repo installs a feature into a hand-written context
 * object, and those objects are more permissive than cordis at the one point
 * this suite exists to check. `test/features/file-panel/open-row-scene.ts:335`
 * hands the feature `remote: { workspaceFiles: { … } }` as one plain property;
 * cordis does not work that way. `ctx.remote` is a traceable proxy whose tracker
 * is `associate: 'remote'` (`vendor/cordis/src/utils.ts`), so reading a member of
 * the namespace is re-dispatched to `Reflect.get(ctx, 'remote.workspaceFiles')`:
 * an independent service, registered by the api-gateway's
 * `RemoteNamespaceService` under a fiber of its own
 * (`packages/api/gateway/src/client/index.ts:653,765`), gated by the consuming
 * fiber's `inject` exactly like any other service. A fake context cannot see that
 * gate, which is why a missing `inject` entry stayed green in every suite that
 * does not use cordis.
 *
 * The assertions below are the reader's symptom rather than "no exception was
 * thrown". A read of an undeclared service does not reject `apply`: the panel's
 * controller catches the failure and the view renders its own failure copy, so
 * the plugin activates happily while the reader sees an error line where a file
 * tree should be. The first test therefore reads the failure text off the
 * rendered markup and asserts there is none, and the second asserts the listing
 * really arrived. Those are the two halves of "the files tab works".
 *
 * @module @deepseek-ai/dsh-tweaks/test/client-entry/client-entry
 */

import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SIDEBAR_RIGHT_ANCHORS } from '../../src/client/dom/host-anchors.ts'
import { EN, ZH } from '../../src/client/features/file-panel/locales.ts'
import * as entry from '../../src/client/index.ts'
import { clientEntryScene, FILES_TAB_ID, SESSION_ID, WORKSPACE_ROOT } from './scene.ts'

/**
 * Every element the panel's React root was asked to render.
 *
 * `react-dom/client` cannot load in plain Node (it wants a browser), and the
 * root is the one part of the panel that genuinely needs it. Recording the
 * element and rendering it with the *real* server renderer keeps the check
 * honest: the text asserted on below is the markup the plugin's own view
 * produces, not a stand-in's paraphrase of it. `vi.hoisted` because `vi.mock` is
 * lifted above the imports and the factory may not close over module scope.
 */
const root = vi.hoisted(() => ({ elements: [] as unknown[] }))

vi.mock('react-dom/client', () => ({
  createRoot: () => ({
    render: (element: unknown) => {
      root.elements.push(element)
    },
    unmount: () => {},
  }),
}))

// The view classifies files through the host's own package, whose runtime
// dependencies do not resolve in this Node environment. Only its names have to
// exist: the panel never draws an icon here, because the markup is produced by
// the server renderer rather than by a DOM.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  FileTypeIcon: () => null,
  GuideArtworkFiles: () => null,
  IconCheckOutlineRegular: () => null,
  IconCopyOutlineRegular: () => null,
  IconFolderCloseRegular: () => null,
  IconFolderOpenRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconSearchOutlineRegular: () => null,
  IconWarningOutlineRegular: () => null,
  IconWorkspaceTreeOutlineRegular: () => null,
  Input: () => null,
  MenuItemButton: () => null,
  PathLabel: () => null,
  Tooltip: () => null,
  classifyFileType: () => 'file',
  writeClipboard: () => Promise.resolve(true),
}))

/**
 * The value of cordis's `FiberState.ACTIVE`.
 *
 * `FiberState` is a `const enum`, so it is erased from the runtime module and
 * cannot be imported here; its numeric values are stable (`fiber.ts`: PENDING,
 * LOADING, ACTIVE). The behavioural assertions around this one are what
 * actually describe "loaded", so the number is named rather than bare.
 */
const FIBER_ACTIVE = 2

/**
 * The panel's failure copy, read from the dictionaries rather than spelled here.
 *
 * The wording is the look: pinning it would block the next person from rewording
 * the line. What this file guards is that the failure is never *said* at all,
 * which is the `error.unavailable` key, whatever it is currently translated to.
 */
const FAILURE_COPY = [ZH['error.unavailable'], EN['error.unavailable']] as const

/** The note row the view renders for a level that could not be read. */
const FAILED_NOTE = /data-dsh-tweaks-files-note="failed"[^>]*>([^<]*)</gu

/** The row anchors the view writes, one pair per drawn tree entry. */
const TREE_ROW = /data-files-entry="(\w+)" data-files-path="([^"]+)"/gu

/** React's escape for the characters a failure message can carry. */
const ENTITIES: readonly (readonly [RegExp, string])[] = [
  [/&quot;/gu, '"'],
  [/&#x27;/gu, '\''],
  [/&lt;/gu, '<'],
  [/&gt;/gu, '>'],
  [/&amp;/gu, '&'],
]

/**
 * The failure lines the panel put on screen, as the reader sees them.
 *
 * Read out of the rendered markup rather than from a return value, because the
 * failure has no return value: it is caught one layer down and turned into
 * copy. That is exactly why this bug survived a suite full of assertions on
 * install results.
 * @param markup - the panel's rendered markup.
 * @returns one decoded line per failed level that was drawn.
 */
function failureLines(markup: string): string[] {
  const lines: string[] = []
  for (const match of markup.matchAll(FAILED_NOTE)) {
    let text = match[1] ?? ''
    for (const [entity, character] of ENTITIES) text = text.replace(entity, character)
    lines.push(text)
  }
  return lines
}

/** Load the entry over a fresh scene and let the deferred docking and listing settle. */
async function scene() {
  root.elements.length = 0
  return clientEntryScene(entry, { elements: root.elements as ReactElement[] })
}

describe('client entry over real cordis', () => {
  it('never puts a read failure on screen', async () => {
    const loaded = await scene()
    try {
      // The symptom in the bug report, read off the page the reader is looking
      // at. With the namespace undeclared this is the line that appears, as
      // `读取失败：cannot get property "remote.workspaceFiles" without inject`.
      expect(failureLines(loaded.allMarkup())).toEqual([])
      for (const copy of FAILURE_COPY)
        expect(loaded.allMarkup()).not.toContain(copy)
    }
    finally {
      await loaded.unload()
    }
  })

  it('activates, and lists the workspace root through the namespace it declares', async () => {
    const loaded = await scene()
    try {
      expect(loaded.fiber.state).toBe(FIBER_ACTIVE)
      // The panel's one listing: the root of the on-screen session's workspace.
      // This is the reader's exact gesture, opening the files tab, reduced to
      // the call it makes; an undeclared `remote.workspaceFiles` turns it into a
      // rejected read instead.
      expect(loaded.listed).toEqual([{ sessionId: SESSION_ID, path: WORKSPACE_ROOT }])
    }
    finally {
      await loaded.unload()
    }
  })

  it('renders the entries the namespace answered with as tree rows', async () => {
    const loaded = await scene()
    try {
      const markup = loaded.lastMarkup()
      // The view's own row anchors, one per entry, in the order the tree draws
      // them: a directory first, then the file. Substring-matching the names
      // would pass on a stray mention; these are the rows a reader clicks.
      expect([...markup.matchAll(TREE_ROW)].map(match => `${match[1]} ${match[2]}`))
        .toEqual(['directory /w/src', 'file /w/README.md'])
    }
    finally {
      await loaded.unload()
    }
  })

  it('draws the panel into the files tab body', async () => {
    const loaded = await scene()
    try {
      // The docking is what puts the panel on the page at all: an entry that
      // activates and lists but never docks shows the reader nothing.
      const host = loaded.document.querySelector('[data-dsh-tweaks-file-panel-host]')
      expect(host?.getAttribute('data-dsh-tweaks-file-panel-host')).toBe('page')
      // The container is a child of the tab's own body seat, not merely present
      // somewhere in the document: `findTabBody` is what picks that seat, and a
      // regression that docked into the title would still satisfy a bare
      // existence check.
      const container = loaded.document.querySelector('[data-dsh-tweaks-file-panel]')
      expect(container?.parentNode?.getAttribute(SIDEBAR_RIGHT_ANCHORS.tab.name)).toBe(FILES_TAB_ID)
    }
    finally {
      await loaded.unload()
    }
  })

  it('takes the built-in files kind over in the extension band', async () => {
    const loaded = await scene()
    try {
      // The band is what makes the takeover happen at all. In `builtin` the
      // registry refuses a second registration for the same kind, and the panel
      // would never be the one in force.
      expect(loaded.tabTypes).toEqual([expect.objectContaining({
        id: '@leiwang2000/dsh-tweaks/file-panel',
        kind: 'files',
        priority: 'extension',
      })])
    }
    finally {
      await loaded.unload()
    }
  })

  it('registers a title for the kind it took over, and the guide entry that went with it', async () => {
    const loaded = await scene()
    try {
      // Taking the kind over takes the built-in type's other contributions out
      // of force with it, and neither is optional (ADR-0003): without the title
      // seat the chip falls back to bare registry text, and without
      // `icon`/`commandId` the guide's door loses its glyph and key hint.
      expect(loaded.registrations.map(row => row.name)).toContain('sidebar.right.pane.tab.title')
      expect(loaded.tabTypes[0]).toMatchObject({ commandId: 'workspace.files', hasIcon: true })
    }
    finally {
      await loaded.unload()
    }
  })
})
