/**
 * Effect-scope helpers for the browser half.
 *
 * Every resource this plugin adds to the host (DOM nodes, style elements,
 * listeners, observers, subscriptions) must come back out when the plugin
 * unloads. Cordis gives a plugin one place to make that true: a function passed
 * to `ctx.effect` runs inside the plugin's own fiber scope, and the disposer it
 * returns is called on unload.
 *
 * These helpers exist so the plugin's own install/uninstall code can be
 * exercised without a cordis context at all, which is what makes "unload leaves
 * nothing behind" a testable claim rather than an assertion of good intent.
 *
 * @module @leiwang2000/dsh-tweaks/client/effect
 */

/** A resource that can be released. Mirrors cordis's own disposer shape. */
export type Disposer = () => void

/** The subset of a cordis context this plugin's install helpers need. */
export interface EffectScope {
  /**
   * Run `body` in the current fiber scope and own whatever it returns.
   * @param body - installs a resource and returns its disposer.
   * @param label - diagnostic name for the effect.
   */
  effect: (body: () => Disposer, label?: string) => unknown
}
