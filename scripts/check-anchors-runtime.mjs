#!/usr/bin/env node
/**
 * Seam six: the host anchors this plugin's DOM patches depend on still exist
 * in the DSH that is actually installed, not just in the pinned reference tree.
 *
 * `scripts/check-anchors.mjs` verifies every declared anchor against
 * `deepseek-harness/`, which is pinned. A pin can lag the running DSH, because
 * the submodule is moved deliberately and the installed copy may be newer or
 * patched. A rename made after the pin would pass that check and still break
 * every patch at runtime. This script reads the same declaration list and
 * verifies each anchor against an installed DSH instead.
 *
 * Two bundle locations hold the markup, and both are scanned:
 *
 * 1. **Dynamic plugin rows** ship one `lib/client.js` each, so an anchor
 *    written by `ui-sidebar-right` or `ui-sidebar-files` lives there.
 * 2. **Platform modules** (`ui-dockkit`, `ui-primitives`, `ui-slots`,
 *    `dsh-client-store`) are not installed as their own packages; the shell
 *    bundles them into `@deepseek-ai/dsh-web-frontend`'s Vite output. Their
 *    anchors therefore only exist in the shell's `dist/assets/*.js`.
 *
 * **What this check may not do is pass without checking.** It reads an
 * installation this repository does not control, so it cannot be part of
 * `pnpm run ci` the way `check-anchors.mjs` is: CI installs this package's
 * dependencies and nothing else, so it would find no DSH and report success for
 * work it never did. `verify-e2e.mjs` is kept out of `ci` for the same reason.
 * The check is therefore a local drift alarm, run on purpose.
 *
 * Once an installation *is* in hand, everything is verified or the run fails: an
 * anchor with nowhere to look, or an owner whose package is missing, is a
 * failure rather than a note. A note is reserved for "there was no installation
 * to check against", which is a fact about the machine and not about the
 * anchors.
 *
 * Run: `node scripts/check-anchors-runtime.mjs`. Pass `--dsh <dir>` to name the
 * installation's own package directory (the one holding `package.json`); a
 * named path that does not hold one is an error. Pass `--require` to turn a
 * missing installation into a failure too, for a CI that pins its runtime.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/check-anchors-runtime
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { packageNameOf, readDeclaredAnchors, spellsAttribute } from './host-anchor-declarations.mjs'

/** Collect assertion failures instead of throwing on the first. */
const failures = []
/** Collect successful assertions for the report. */
const passes = []
/** Printed but not counted as failures: facts about the machine, not the anchors. */
const notes = []

/** The installed package every layout here is a location for. */
const DSH_PACKAGE = '@deepseek-ai/dsh'

/**
 * Record one assertion.
 * @param {string} label - what was checked.
 * @param {boolean} condition - the outcome.
 * @param {string} [detail] - evidence shown when the assertion fails.
 */
function check(label, condition, detail) {
  if (condition) {
    passes.push(label)
    return
  }
  failures.push(detail === undefined ? label : `${label}: ${detail}`)
}

/**
 * Read `--flag value` and `--flag` out of argv.
 *
 * A value-taking flag at the end of argv, or followed by another flag, is a
 * usage error rather than an empty value: silently reading `undefined` (and
 * then falling back to discovery) would run the check against some other
 * installation than the one the caller meant, which is the failure mode this
 * script exists to catch elsewhere.
 * @param {readonly string[]} argv - process arguments.
 * @returns {{ require: boolean, dsh: string | undefined, usageError: string | undefined }} the parsed flags.
 */
function parseArgs(argv) {
  const unsupported = argv.filter(argument => argument.startsWith('--') && argument !== '--dsh' && argument !== '--require')
  if (unsupported.length > 0)
    return { require: argv.includes('--require'), dsh: undefined, usageError: `unknown flag: ${unsupported.join(', ')}` }
  const require = argv.includes('--require')
  const dshAt = argv.indexOf('--dsh')
  if (dshAt === -1)
    return { require, dsh: undefined, usageError: undefined }
  const value = argv[dshAt + 1]
  if (value === undefined || value.startsWith('--'))
    return { require, dsh: undefined, usageError: '--dsh needs the installation package directory as its value' }
  return { require, dsh: value, usageError: undefined }
}

/**
 * The DSH package directory named by `--dsh`, verified to be one.
 *
 * The flag names the package directory itself (the one holding `package.json`),
 * not a parent that happens to contain it: guessing which ancestor level is the
 * package is what made the previous version's discovery wrong for one of the two
 * layouts it claimed to support.
 * @param {string} directory - the path the caller passed.
 * @returns {{ directory: string, version: string } | { error: string }} the installation, or why it is not one.
 */
function readNamedInstallation(directory) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  }
  catch {
    return { error: `--dsh ${directory} does not hold a package.json` }
  }
  if (manifest.name !== DSH_PACKAGE)
    return { error: `--dsh ${directory} is ${manifest.name ?? 'an unnamed package'}, not ${DSH_PACKAGE}` }
  return { directory, version: manifest.version }
}

/**
 * Resolve the installed DSH package directory by version, from known layouts.
 *
 * The `dsh` launcher is a generic launcher binary (a version-manager shim)
 * rather than a JavaScript entry, so its real path names the launcher, not the
 * installation. The installation is therefore found by enumerating the known
 * layouts, then keeping the package directory whose `package.json` version
 * equals what `dsh --version` reports. A mismatch means the shim points
 * somewhere this script cannot see, and reporting that is better than checking
 * the wrong tree.
 *
 * Each layout is enumerated down to the package directory itself, so no caller
 * has to know how many levels up the layout starts.
 * @returns {{ directory: string, version: string } | { error: string }} the installation, or why none was found.
 */
function locateInstalledDsh() {
  let version
  try {
    version = execFileSync('dsh', ['--version'], { encoding: 'utf8', timeout: 20_000 }).trim()
  }
  catch {
    return { error: 'no `dsh` launcher on PATH, so there is no installed version to compare against' }
  }
  const home = homedir()
  const layouts = [
    // The version-manager layout: one directory per install, keyed by an opaque id.
    { container: join(home, '.vite-plus/packages/@deepseek-ai/dsh'), nested: true },
    // A flat global install: the package sits where the layout names it.
    { container: join(home, '.local/share/pnpm/global/5/node_modules/@deepseek-ai/dsh'), nested: false },
  ]
  const packages = packagesUnder(layouts)
  for (const directory of packages) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      if (manifest.version === version)
        return { directory, version }
    }
    catch {
      // Not an installation: the next candidate may be.
    }
  }
  return { error: `\`dsh --version\` reports ${version}, but no known install layout holds a ${DSH_PACKAGE} at that version` }
}

/**
 * Every package directory the known layouts can hold, as absolute paths.
 * @param {readonly {container: string, nested: boolean}[]} layouts - the layouts to enumerate.
 * @returns {readonly string[]} candidate package directories.
 */
function packagesUnder(layouts) {
  const packages = []
  for (const { container, nested } of layouts) {
    if (!nested) {
      packages.push(container)
      continue
    }
    let entries
    try {
      entries = readdirSync(container, { withFileTypes: true })
    }
    catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory())
        packages.push(join(container, entry.name, 'lib/node_modules/@deepseek-ai/dsh'))
    }
  }
  return packages
}

/**
 * Collect every readable `.js` file under one directory, recursively.
 * @param {string} directory - the directory to walk.
 * @returns {Promise<readonly string[]>} the file paths.
 */
async function collectJs(directory) {
  const found = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  }
  catch {
    return found
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...await collectJs(path))
      continue
    }
    if (entry.name.endsWith('.js'))
      found.push(path)
  }
  return found
}

/**
 * The `node_modules/@deepseek-ai` directory holding an installation's packages.
 *
 * Everything the CLI depends on is nested under the CLI package itself, so the
 * package directory passed in is the base: `<package>/node_modules/@deepseek-ai`.
 * The dynamic plugin rows and the shell bundle both live there.
 * @param {string} install - the installation's own package directory.
 * @returns {string} the directory to read package names from.
 */
function modulesOf(install) {
  return join(install, 'node_modules/@deepseek-ai')
}

/**
 * The roots one anchor may be written under, as absolute directories.
 *
 * A declared owner is either a dynamic plugin row (its own installed package
 * directory) or a platform module (only inside the shell bundle).
 * @param {string} install - the installation's own package directory.
 * @param {string} owner - the upstream package path from the declaration.
 * @returns {Promise<readonly string[]>} the directories to search.
 */
async function rootsFor(install, owner) {
  const modules = modulesOf(install)
  const name = packageNameOf(owner)
  const roots = []
  // A dynamically loaded row has its own installed directory with a `lib/` face.
  const own = join(modules, name.replace('@deepseek-ai/', ''), 'lib')
  try {
    if ((await stat(own)).isDirectory())
      roots.push(own)
  }
  catch {
    // Not a row of its own: it may still be bundled into the shell.
  }
  // The shell bundle is where every platform module's markup ends up.
  const shell = join(modules, 'dsh-web-frontend/dist/assets')
  try {
    if ((await stat(shell)).isDirectory())
      roots.push(shell)
  }
  catch {
    // No shell bundle: nothing to search for this one.
  }
  return roots
}

/**
 * Search the roots for one attribute's spelling.
 * @param {readonly string[]} roots - the directories to search.
 * @param {string} attribute - the attribute name.
 * @returns {Promise<string | undefined>} the first file spelling it, or undefined.
 */
async function findAttribute(roots, attribute) {
  for (const root of roots) {
    for (const file of await collectJs(root)) {
      let source
      try {
        source = await readFile(file, 'utf8')
      }
      catch {
        continue
      }
      if (spellsAttribute(source, attribute))
        return file
    }
  }
  return undefined
}

/** Run the check and report. */
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.usageError !== undefined) {
    notes.push(args.usageError)
    report()
    return
  }

  const anchors = await readDeclaredAnchors()
  check('the declaration module declares at least one anchor', anchors.length > 0)

  const resolved = args.dsh === undefined ? locateInstalledDsh() : readNamedInstallation(args.dsh)
  if ('error' in resolved) {
    reportWithoutInstallation(args.require, resolved.error)
    report()
    return
  }

  console.log(`  checking against DSH ${resolved.version} at ${resolved.directory}`)
  const modules = modulesOf(resolved.directory)
  // Every owner must have somewhere to look, or the run is incomplete rather
  // than clean: a package that is not where the install layout says it is is a
  // fact about drift, which is exactly what this check exists to report.
  check(
    `the install holds its package directory (${modules})`,
    await isDirectory(modules),
    'not found; the layout the script knows is not the one this DSH was installed with',
  )
  for (const { name, owner } of anchors) {
    const roots = await rootsFor(resolved.directory, owner)
    if (roots.length === 0) {
      check(`${name} has somewhere to be looked for`, false, `${owner} is neither an installed row nor part of the shell bundle`)
      continue
    }
    const found = await findAttribute(roots, name)
    check(`${name} is still written for ${resolved.version}`, found !== undefined, `not found in ${roots.join(', ')}`)
  }

  report()
}

/**
 * Record a run that had no installation to check against.
 *
 * A missing installation is a fact about the machine, not a verdict on the
 * anchors, so by default it is a note. The report then says plainly that
 * nothing was verified, and `--require` makes it fatal for a caller that pins
 * its runtime.
 * @param {boolean} require - whether a missing installation is fatal.
 * @param {string} reason - why no installation was found.
 */
function reportWithoutInstallation(require, reason) {
  const message = `NO INSTALLED DSH, nothing was verified: ${reason} (pass --dsh <package directory>, or --require to make this fatal)`
  if (require) {
    check('an installed DSH is available to check against', false, message)
    return
  }
  notes.push(message)
}

/**
 * Whether a path is an existing directory.
 * @param {string} path - the path to test.
 * @returns {Promise<boolean>} true when it is a directory.
 */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  }
  catch {
    return false
  }
}

/** Print the collected result and set the exit code. */
function report() {
  for (const label of passes) console.log(`  ok   ${label}`)
  for (const message of notes) console.log(`  note ${message}`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)
  if (failures.length > 0) {
    console.error(`\nruntime anchor contract: ${failures.length} failure(s), ${passes.length} check(s) passed`)
    process.exitCode = 1
    return
  }
  if (passes.length <= 1) {
    // At most "the declaration module declares at least one anchor" passed: no
    // anchor was actually verified, so this must not read as a pass.
    console.error('\nruntime anchor contract: NOTHING WAS VERIFIED (no installed DSH to check against)')
    process.exitCode = 1
    return
  }
  console.log(`\nruntime anchor contract: ${passes.length} check(s) passed`)
}

await main()
