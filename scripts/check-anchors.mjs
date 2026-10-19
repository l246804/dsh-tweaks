#!/usr/bin/env node
/**
 * Seam four: the host anchors this plugin's DOM patches depend on still exist.
 *
 * ADR-0002 allows DOM patches only through stable anchors, and the failure it
 * warns about is silent: upstream renames an attribute, every test still
 * passes (the tests build their own stand-in markup), and the patch stops
 * matching anything in a real browser. Nothing else in the toolchain can see
 * that, because the patch compiles and the stand-in looks like the host.
 *
 * `src/client/dom/host-anchors.ts` declares every host attribute the plugin
 * reads or reproduces, each with the upstream package that writes it. This
 * script verifies each one against the pinned submodule:
 *
 * 1. the owning package directory exists, and
 * 2. the attribute is spelled somewhere in that package's sources.
 *
 * ESLint's `no-restricted-syntax` keeps host attribute literals out of every
 * other source file, so the declaration list is the complete surface; this
 * check is the other half of that pair. A `.css`/`.tsx`/`.ts` file is enough:
 * upstream may write an anchor in markup, in a stylesheet, or in a query.
 *
 * Run: `node scripts/check-anchors.mjs` (part of `pnpm run ci`). It needs the
 * `deepseek-harness/` submodule checked out; without it the run fails loudly
 * rather than passing vacuously, because a skipped check and a passing check
 * must not look alike.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/check-anchors
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'
import { DECLARATIONS, PACKAGE_ROOT, readDeclaredAnchors, spellsAttribute } from './host-anchor-declarations.mjs'

const UPSTREAM_ROOT = join(PACKAGE_ROOT, 'deepseek-harness')
const UPSTREAM_PACKAGES = join(UPSTREAM_ROOT, 'packages')

/** File extensions a host anchor may be written in. */
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css', '.mts', '.js', '.mjs']
/** Directories never worth descending into; upstream builds its own output here. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'lib', 'dist', 'coverage', '.git'])

/** Collect assertion failures instead of throwing on the first. */
const failures = []
/** Collect successful assertions for the report. */
const passes = []

/**
 * Record one assertion.
 * @param label - what was checked.
 * @param condition - the outcome.
 * @param detail - evidence shown when the assertion fails.
 */
function check(label, condition, detail) {
  if (condition) {
    passes.push(label)
    return
  }
  failures.push(detail === undefined ? label : `${label}: ${detail}`)
}

/**
 * Collect every readable source file under one directory.
 * @param directory - the directory to walk.
 * @returns the file paths.
 */
async function collectSources(directory) {
  const found = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name))
      continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...await collectSources(path))
      continue
    }
    if (SCANNED_EXTENSIONS.some(extension => entry.name.endsWith(extension)))
      found.push(path)
  }
  return found
}

/**
 * Find where one attribute is written under one package.
 * @param packageDirectory - the package to scan.
 * @param attribute - the attribute name.
 * @returns the first file spelling it, or undefined when none does.
 */
async function findAnchor(packageDirectory, attribute) {
  for (const file of await collectSources(packageDirectory)) {
    const source = await readFile(file, 'utf8')
    if (spellsAttribute(source, attribute))
      return relative(PACKAGE_ROOT, file)
  }
  return undefined
}

/** Verify the submodule is present, so a missing checkout cannot pass silently. */
async function checkSubmodule() {
  let present = true
  try {
    const info = await stat(UPSTREAM_PACKAGES)
    present = info.isDirectory()
  }
  catch {
    present = false
  }
  check(
    'the upstream submodule is checked out',
    present,
    'deepseek-harness/packages is missing; run `git submodule update --init --recursive`',
  )
  return present
}

async function main() {
  if (!await checkSubmodule()) {
    for (const failure of failures) console.error(`  FAIL ${failure}`)
    console.error('\nanchor contract: cannot verify anchors without the submodule')
    process.exitCode = 1
    return
  }

  const anchors = await readDeclaredAnchors()
  check('the declaration module declares at least one anchor', anchors.length > 0, DECLARATIONS)

  for (const { name, owner } of anchors) {
    const ownerDirectory = join(UPSTREAM_PACKAGES, owner)
    let ownerExists = true
    try {
      ownerExists = (await stat(ownerDirectory)).isDirectory()
    }
    catch {
      ownerExists = false
    }
    if (!ownerExists) {
      check(`${name} has an owning package`, false, `upstream packages/${owner} does not exist`)
      continue
    }
    const found = await findAnchor(ownerDirectory, name)
    check(`${name} is written by ${owner}`, found !== undefined, found ?? `not found under packages/${owner}`)
  }

  for (const label of passes) console.log(`  ok   ${label}`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)

  if (failures.length > 0) {
    console.error(`\nanchor contract: ${failures.length} failure(s), ${passes.length} check(s) passed`)
    process.exitCode = 1
    return
  }
  console.log(`\nanchor contract: ${passes.length} check(s) passed`)
}

await main()
