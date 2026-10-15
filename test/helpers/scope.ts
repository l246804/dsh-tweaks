/**
 * A recording stand-in for the cordis context a client feature installs into.
 *
 * A feature's install is written against `ctx.effect` and the services it
 * injects. This helper supplies both, and, the part that matters, records
 * every disposer the installation produced, so a test can assert that
 * uninstalling leaves no DOM node, attribute, listener or subscription behind.
 *
 * The point is not to imitate cordis. It is to make the plugin's own install and
 * uninstall path executable in a plain Node test, which is the only way "no
 * residue after unload" becomes a checked claim rather than an intention.
 *
 * @module @leiwang2000/dsh-tweaks/test/helpers/scope
 */

import type { Disposer, EffectScope } from '../../src/client/effect.ts'

/** A scope plus the evidence of what it owns. */
export type RecordingScope = EffectScope & {
  /** Every label passed to `effect`, in installation order. */
  readonly labels: readonly string[]
  /**
   * Run a disposer in the current scope, recording it.
   * @param disposer - the disposer to own.
   * @returns the disposer, unchanged.
   */
  own: (disposer: Disposer) => Disposer
  /** Whether the scope still owns anything. */
  readonly pending: () => number
  /** Run every recorded disposer, newest first; safe to call twice. */
  disposeAll: () => void
}

/**
 * Create a recording effect scope.
 * @returns the scope.
 */
export function createRecordingScope(): RecordingScope {
  const owned: Disposer[] = []
  const labels: string[] = []
  let disposed = false

  const own = (disposer: Disposer): Disposer => {
    // A disposer registered after teardown would otherwise be stranded; run it
    // immediately, mirroring what a disposed fiber does.
    if (disposed) {
      disposer()
      return disposer
    }
    owned.push(disposer)
    return disposer
  }

  return {
    labels,
    own,
    effect(body: () => Disposer, label?: string): Disposer {
      labels.push(label ?? '<unnamed>')
      return own(body())
    },
    pending: () => owned.length,
    disposeAll(): void {
      if (disposed)
        return
      disposed = true
      while (owned.length > 0) owned.pop()?.()
    },
  }
}
