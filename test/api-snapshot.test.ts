import { fileURLToPath } from 'node:url'
import { guardStaleBuild } from 'tsdown-stale-guard'
import { snapshotApiPerEntry } from 'tsnapi/vitest'
import { beforeAll, describe } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('api snapshot', () => {
  beforeAll(async () => {
    await guardStaleBuild({ root })
  })

  const browserEntry = './client'

  snapshotApiPerEntry(root, {
    // The `./client` export is a browser closure factory, not a Node module: it
    // calls `window.__ModuleLoader__.load` at load time, so it has no API to
    // snapshot here. Its contract is asserted by `scripts/check-artifact.mjs`
    // instead, which runs it through a stand-in module loader.
    entryFilter: ({ entryName }) => entryName !== browserEntry,
  })
})
