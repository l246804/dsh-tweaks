#!/usr/bin/env node
/**
 * Product-level verification: install this package into an isolated DSH_HOME,
 * boot the real Web profile, and assert the plugin loaded without an activation
 * failure and its browser artifact is served.
 *
 * This is the only layer that can show the plugin actually works. The other
 * checks prove the artifact is well-formed; this one proves DSH accepts it.
 *
 * The run is hermetic by construction:
 * - `DSH_HOME` points inside the repository (`.verify-home`, git-ignored and
 *   excluded from every local tool), so the user's own `~/.dsh` is never touched.
 * - The server binds `--port 0`, so it cannot collide with the running GUI.
 * - The child is always terminated, including on failure.
 *
 * Run: `pnpm run verify:e2e`. It is kept out of `pnpm run ci` because it boots a
 * server and needs a built artifact; CI runs the artifact contract instead.
 *
 * @module @leiwang2000/dsh-tweaks/scripts/verify-e2e
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VERIFY_HOME = join(PACKAGE_ROOT, '.verify-home')
const PROFILE = 'verify'
/** How long to let the server boot before reading its startup report. */
const BOOT_TIMEOUT_MS = 90_000

/** Console prefixes that mean a plugin failed to activate, from the startup audit. */
const ACTIVATION_FAILURES = [
  /did not activate/u,
  /startup failed/u,
  /Plugins waiting for services/u,
]

const failures = []
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
 * Run a command to completion, capturing both streams.
 * @param command - the executable.
 * @param args - its arguments.
 * @param options - extra spawn options.
 * @returns the exit code and the captured output.
 */
async function run(command, args, options = {}) {
  return await new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, DSH_HOME: VERIFY_HOME, NO_COLOR: '1' },
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', error => resolveRun({ code: -1, stdout, stderr: `${stderr}${error.message}` }))
    child.on('close', code => resolveRun({ code: code ?? -1, stdout, stderr }))
  })
}

/**
 * Start the Web profile and wait until it reports its URL or fails to activate.
 * @param logPath - where the child's output is written.
 * @returns the child, the log text collected so far, and a stop function.
 */
async function bootWebProfile(logPath) {
  const child = spawn('dsh', ['--profile', PROFILE, '--port', '0', '--no-open'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DSH_HOME: VERIFY_HOME, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let log = ''
  let settled
  const ready = new Promise((resolveReady) => {
    settled = resolveReady
  })
  const append = (chunk) => {
    log += chunk
    // The server prints its URL once the graph is up and audited; an activation
    // failure prints first when it is a required row.
    if (/dsh web: http/u.test(log) || ACTIVATION_FAILURES.some(pattern => pattern.test(log)))
      settled()
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.on('error', error => append(`spawn error: ${error.message}`))
  child.on('close', () => settled())

  const timer = setTimeout(settled, BOOT_TIMEOUT_MS)
  await ready
  clearTimeout(timer)
  await writeFile(logPath, log, 'utf8').catch(() => {})

  return {
    child,
    log,
    stop: async () => {
      child.kill('SIGTERM')
      // Give the server a moment for an orderly exit before the caller proceeds.
      await new Promise(stopResolve => setTimeout(stopResolve, 1500))
      if (child.exitCode === null)
        child.kill('SIGKILL')
    },
  }
}

/**
 * Redeem the printed URL's one-time token and keep the trust cookie it sets.
 *
 * The fence admits the page only with that cookie, so every later request, the
 * page itself and the plugin artifact behind it, has to carry it.
 * @param url - the printed URL, including its `token` query parameter.
 * @returns the `Cookie` header value, or an empty string when the server set none.
 */
async function fetchCookie(url) {
  const response = await fetch(url, { redirect: 'manual' })
  const setCookie = response.headers.getSetCookie?.() ?? []
  return setCookie.map(entry => entry.split(';')[0]).join('; ')
}

/**
 * Fetch a URL and return its body, following the server's own redirect.
 * @param url - the URL to request.
 * @param cookie - the `Cookie` header to send, when the fence requires one.
 * @returns the status and body.
 */
async function fetchText(url, cookie = '') {
  const response = await fetch(url, {
    redirect: 'follow',
    ...(cookie === '' ? {} : { headers: { cookie } }),
  })
  return { status: response.status, body: await response.text() }
}

/** Install the package into the isolated profile and boot it, then assert. */
async function main() {
  const manifest = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const name = manifest.name

  // The artifact must exist before anything can be installed.
  try {
    await readFile(join(PACKAGE_ROOT, 'dist', 'client.js'))
    check('built client artifact exists', true)
  }
  catch {
    check('built client artifact exists', false, 'run `pnpm run build` first')
    report()
    return
  }

  // A fresh home each run: a stale profile would let an earlier install mask a
  // current failure.
  await rm(VERIFY_HOME, { recursive: true, force: true })

  // Seed the profile from the shipped Web template. `dsh plugin add` would
  // otherwise initialize a base-only profile, which has no Web app to boot and
  // therefore no way to observe the browser half at all.
  const seed = await run('dsh', ['--profile', PROFILE, '--from-default-profile', 'web', '--help'])
  check('the profile is seeded from the Web template', seed.code === 0, `exit ${seed.code}: ${seed.stderr.slice(-500)}`)

  // One command installs and activates the bundle.
  const install = await run('dsh', ['plugin', '--profile', PROFILE, 'add', PACKAGE_ROOT])
  check(
    'one command installs the bundle',
    install.code === 0,
    `exit ${install.code}: ${install.stdout}${install.stderr}`,
  )

  const profileManifest = JSON.parse(
    await readFile(join(VERIFY_HOME, 'profiles', PROFILE, 'package.json'), 'utf8'),
  )
  const bundles = profileManifest.dsh?.profile?.bundles ?? []
  check(
    'the bundle layer is recorded in the profile',
    bundles.includes(name),
    JSON.stringify(bundles),
  )

  // Boot-free: the composed configuration must contain this package's row.
  const dump = await run('dsh', ['--profile', PROFILE, '--dump-config'])
  check(
    'the composed configuration carries this plugin row',
    dump.stdout.includes(name),
    `exit ${dump.code}`,
  )

  const logPath = join(await mkdtemp(join(tmpdir(), 'dsh-tweaks-e2e-')), 'boot.log')
  const server = await bootWebProfile(logPath)
  try {
    const activationFailure = ACTIVATION_FAILURES.find(pattern => pattern.test(server.log))
    check(
      'no activation failure at startup',
      activationFailure === undefined,
      activationFailure === undefined ? undefined : `matched ${activationFailure}\n${server.log}`,
    )
    check(
      'the Web profile reports its URL',
      /dsh web: http/u.test(server.log),
      server.log.slice(-2000),
    )

    const url = /dsh web: (\S+)/u.exec(server.log)?.[1]
    if (url !== undefined) {
      // The printed URL carries the one-time token that grants the browser its
      // trust cookie, so the page is fetched through that exact URL and the
      // cookie is carried into the artifact request.
      const cookie = await fetchCookie(url)
      const page = await fetchText(url, cookie)
      check('the served page carries the boot graph', page.status === 200, `status ${page.status}`)
      // The graph row is the shell's proof that the host composed this package
      // as a client entry; a row without a URL would never be fetched.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      const row = new RegExp(`"id":"${escaped}"`, 'u').test(page.body)
      check('the boot graph lists this plugin', row, 'no graph row for the package name')

      // Follow the URL the graph itself advertises. The shell batches plugin
      // artifacts into one combo request, so the row's `url` is relative to the
      // document and is the only address guaranteed to serve this artifact.
      const artifactUrl = new RegExp(`"url":"([^"]*${escaped}[^"]*)"`, 'u').exec(page.body)?.[1]
      if (artifactUrl !== undefined) {
        const resolved = new URL(artifactUrl, url).href
        const artifact = await fetchText(resolved, cookie)
        check(
          'the served client artifact is the closure factory',
          artifact.body.includes('__ModuleLoader__.load'),
          `status ${artifact.status} from ${resolved}: ${artifact.body.slice(0, 200)}`,
        )
        check('the served artifact registers this package id', artifact.body.includes(JSON.stringify(name)))
      }
      else {
        check('the boot graph advertises this plugin artifact', false, 'no url found in the graph row')
      }
    }
  }
  finally {
    await server.stop()
  }

  report()
}

/** Print the collected result and set the exit code. */
function report() {
  for (const label of passes) console.log(`  ok   ${label}`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)
  if (failures.length > 0) {
    console.error(`\nend-to-end verification: ${failures.length} failure(s), ${passes.length} check(s) passed`)
    process.exitCode = 1
    return
  }
  console.log(`\nend-to-end verification: ${passes.length} check(s) passed`)
}

await main()
