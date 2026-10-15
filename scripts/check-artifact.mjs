#!/usr/bin/env node
/**
 * Seam three: the artifact and loading contract.
 *
 * Two claims this project makes cannot be checked by a type system or by a
 * browser test, and both are the kind that fail silently in production:
 *
 * 1. **The manifest and the patch agree.** `dsh.client`, `exports["./client"]`
 *    and `dsh.bundle.patch` are three separate declarations of one installable
 *    plugin, and a mismatch between them produces a plugin that installs and
 *    then does nothing.
 * 2. **The browser artifact is a closure factory.** The shell registers it
 *    through `window.__ModuleLoader__.load({ id, factory })`, keyed by the
 *    package name, and resolves its imports from the module table. A bundle
 *    that inlined React, or registered under the wrong id, or returned nothing
 *    would look correct on disk and fail in the browser.
 *
 * This script loads the built artifact in a stand-in module loader (the same
 * `load` contract the shell implements) and asserts what the shell would
 * observe. It starts no browser and no server.
 *
 * Run: `node scripts/check-artifact.mjs` (part of `pnpm run ci`).
 *
 * @module @leiwang2000/dsh-tweaks/scripts/check-artifact
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { PLATFORM_MODULES } from './platform-modules.mjs'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Collect assertion failures instead of throwing on the first, so one run reports everything. */
const failures = []
/** Collect successful assertions for a readable report. */
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
 * Read and parse a JSON file.
 * @param path - the file to read.
 * @returns the parsed value.
 */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** Assert the manifest declares an installable bundle whose parts agree. */
async function checkManifest() {
  const manifest = await readJson(join(PACKAGE_ROOT, 'package.json'))
  const name = manifest.name

  check('manifest declares a name', typeof name === 'string' && name.length > 0)

  // The bundle layer: without it `dsh plugin add` installs a plain dependency
  // and activates nothing.
  const patch = manifest.dsh?.bundle?.patch
  check('dsh.bundle.patch is declared', typeof patch === 'string', JSON.stringify(patch))

  if (typeof patch === 'string') {
    const patchPath = join(PACKAGE_ROOT, patch)
    let patchText
    try {
      patchText = await readFile(patchPath, 'utf8')
    }
    catch (error) {
      check(`bundle patch ${patch} exists`, false, String(error))
      return
    }
    check(`bundle patch ${patch} exists`, true)
    // A patch is a YAML sequence of layer operations. The row must name the
    // package by its published name, because Node resolution finds the installed
    // code through it.
    check('bundle patch inserts a row', /^\s*-\s*insert:/mu.test(patchText))
    check(
      'bundle patch mounts this package',
      patchText.includes(name),
      `patch does not mention ${name}`,
    )
  }

  // The browser half's declaration. `platform: web` is what makes the shell
  // serve the artifact at all; a wrong value is silently ignored upstream.
  const client = manifest.dsh?.client
  check('dsh.client is declared', typeof client === 'object' && client !== null)
  check('dsh.client.platform is web', client?.platform === 'web', String(client?.platform))

  // The artifact entry the shell resolves through `exports["./client"]`.
  const clientExport = manifest.exports?.['./client']
  const clientPath = typeof clientExport === 'string' ? clientExport : clientExport?.default
  check('exports["./client"] resolves to a path', typeof clientPath === 'string', JSON.stringify(clientExport))

  // Version drift must fail early. Upstream only compares peers whose names
  // start with `@deepseek-ai/dsh`, so the runtime range has to be one of those.
  const peers = manifest.peerDependencies ?? {}
  const runtimePeers = Object.keys(peers).filter(dependency => dependency === '@deepseek-ai/dsh' || dependency.startsWith('@deepseek-ai/dsh-'))
  check(
    'a @deepseek-ai/dsh peer range declares runtime compatibility',
    runtimePeers.length > 0,
    `peerDependencies: ${JSON.stringify(peers)}`,
  )
  for (const dependency of runtimePeers) {
    const range = peers[dependency]
    // An unpinned `workspace:` protocol is rewritten to the runtime version
    // upstream and therefore never mismatches; it would defeat the check.
    check(
      `peer range for ${dependency} is a real semver range`,
      typeof range === 'string' && range.trim() !== '' && !range.startsWith('workspace:'),
      String(range),
    )
  }

  // The published file list has to carry everything the install and the shim
  // read at runtime.
  const files = manifest.files ?? []
  check('files includes the built output', files.includes('dist'))
  if (typeof patch === 'string' && !patch.startsWith('./dist/')) {
    check('files includes the bundle patch', files.includes(patch.replace(/^\.\//u, '')), JSON.stringify(files))
  }

  return { name, clientPath }
}

/**
 * Load the client artifact through a stand-in of the shell's module loader.
 * @param clientPath - the artifact path from the manifest.
 * @returns the exports the factory produced, plus what it required.
 */
async function loadClientArtifact(clientPath) {
  const source = await readFile(join(PACKAGE_ROOT, clientPath), 'utf8')

  /** Registrations submitted through the facade. */
  const registrations = []
  /** Specifiers the factory resolved through the injected require. */
  const required = []

  const require = (specifier) => {
    required.push(specifier)
    // The shell would return the shared instance. Nothing here needs a working
    // React: this check is about which specifiers the artifact asks for.
    return new Proxy({}, { get: () => () => undefined })
  }
  require.async = async (specifier) => {
    required.push(specifier)
    return {}
  }

  const moduleLoader = {
    load(registration) {
      registrations.push(registration)
    },
  }

  // The artifact is a classic script that assigns to `window`. Evaluating it
  // through `node:vm` is the closest thing to a `<script>` tag without a
  // browser, and it keeps the artifact out of this process's own globals.
  const context = vm.createContext({ window: { __ModuleLoader__: moduleLoader } })
  new vm.Script(source, { filename: clientPath }).runInContext(context)

  check('artifact registers exactly one factory', registrations.length === 1, `registered ${registrations.length}`)
  const registration = registrations[0]
  if (registration === undefined)
    return { exports: undefined, required }

  check('registration carries a string id', typeof registration.id === 'string')
  check('registration carries a factory function', typeof registration.factory === 'function')

  const exports = registration.factory(require)
  return { exports, required, registration }
}

/** Assert the artifact's shape, identity and module edges. */
async function checkArtifact(name, clientPath) {
  if (typeof clientPath !== 'string') {
    check('client artifact is loadable', false, 'no client export path in the manifest')
    return
  }
  let loaded
  try {
    loaded = await loadClientArtifact(clientPath)
  }
  catch (error) {
    check('client artifact is loadable', false, String(error))
    return
  }
  check('client artifact is loadable', true)

  const { exports, required, registration } = loaded
  if (registration === undefined)
    return

  // The registration key is the package name: the shell looks up the graph row
  // by package name and fails the entry if the artifact registered another id.
  check(
    'registration id equals the package name',
    registration.id === name,
    `registered ${JSON.stringify(registration.id)} for package ${JSON.stringify(name)}`,
  )
  check('artifact exports an inject declaration', Array.isArray(exports?.inject), JSON.stringify(exports?.inject))
  check('artifact exports an apply function', typeof exports?.apply === 'function')

  // Every requirement must be answerable by the module table. A miss is a
  // guaranteed runtime throw during materialization.
  const unknown = required.filter(specifier => !PLATFORM_MODULES.has(specifier))
  check(
    'every required module is a platform module',
    unknown.length === 0,
    `unknown: ${JSON.stringify(unknown)}; required: ${JSON.stringify(required)}`,
  )
  // Deliberately not asserted: an artifact with no platform-module edge is a
  // valid one (this package's own skeleton is exactly that). The set that must
  // be closed is the set it *does* request, checked above.
}

/**
 * Materialize the artifact a second time, so the lifecycle check runs against
 * fresh exports rather than the ones an earlier assertion already exercised.
 * @param clientPath - the artifact path from the manifest.
 * @returns the artifact's exports.
 */
async function loadForLifecycle(clientPath) {
  if (typeof clientPath !== 'string')
    return undefined
  try {
    return (await loadClientArtifact(clientPath)).exports
  }
  catch {
    return undefined
  }
}

/**
 * Run the plugin body against a recording context and assert it installs, then
 * uninstalls, cleanly.
 * @param exports - the artifact's exports.
 */
async function checkLifecycle(exports) {
  if (typeof exports?.apply !== 'function')
    return

  /** Disposers the body registered through its scope. */
  const disposers = []
  /** The effect labels the body used. */
  const labels = []

  // The body's contributions are not the subject here; what matters is that
  // each one produced a disposer this run can release.
  const service = () => () => {}

  const ctx = {
    effect(body, label) {
      labels.push(label)
      disposers.push(body())
      return () => {}
    },
    get: () => undefined,
    slots: {
      inject: (slotName, contribute) => service({ slotName, via: 'inject', contribute }),
      register: options => service({ via: 'register', options }),
    },
    sidebarRight: {
      openResource: () => {},
      close: () => {},
      focus: () => {},
      openTabs: [],
    },
    sidebarRightTabs: { register: definition => service({ via: 'tabType', definition }) },
    uiConversation: { registerUserTextRule: rule => service({ via: 'userTextRule', rule }) },
    sessions: { getSnapshot: () => ({ byId: {} }) },
    remote: { workspaceFiles: { list: async () => ({ ok: true, value: {} }), changes: () => ({}) } },
    locale: {
      register: (namespace, dictionaries) => service({ via: 'dictionary', namespace, dictionaries }),
      bind: () => key => key,
    },
  }

  try {
    exports.apply(ctx)
  }
  catch (error) {
    check('apply runs against the host services it injects', false, String(error))
    return
  }
  check('apply runs against the host services it injects', true)

  // Uninstall: run every disposer the body registered. A throw here is the
  // "uninstall leaves residue" failure mode, surfaced as a hard error.
  let released = 0
  for (const disposer of disposers) {
    if (typeof disposer === 'function') {
      disposer()
      released += 1
    }
  }
  check('every effect produced a disposer', disposers.every(disposer => typeof disposer === 'function'))
  check('uninstall releases what install registered', released === disposers.length, `${released}/${disposers.length}`)

  if (labels.length > 0) {
    check('every effect is labelled', labels.every(label => typeof label === 'string' && label.length > 0))
  }
}

/** Run the whole check and report. */
async function main() {
  const manifest = await checkManifest()
  if (manifest !== undefined) {
    await checkArtifact(manifest.name, manifest.clientPath)
    await checkLifecycle(await loadForLifecycle(manifest.clientPath))
  }

  for (const label of passes) console.log(`  ok   ${label}`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)

  if (failures.length > 0) {
    console.error(`\nartifact contract: ${failures.length} failure(s), ${passes.length} check(s) passed`)
    process.exitCode = 1
    return
  }
  console.log(`\nartifact contract: ${passes.length} check(s) passed`)
}

await main()
