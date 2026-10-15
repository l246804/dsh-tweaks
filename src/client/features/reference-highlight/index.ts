/**
 * Reference highlighting in the composer.
 *
 * A hand-typed `@scope/xxx` is not a reference, but the host derives a
 * decoration for it from a syntax guess and styles it as one. Only a chip the
 * user picked from the candidate list, or a `/` token from the trigger's
 * lexicon, is really a reference. This feature takes the guessed decoration out
 * of reference styling while leaving every other behavior alone: the node
 * stays, its attributes stay, and clicking it still previews when it does name
 * a real target.
 *
 * The upstream channel a plugin would rather use, a pluggable text-ref rule on
 * `ctx.uiConversation` next to the `userText` registry, does not exist; the
 * scan lives inside the composer's private Lexical runtime. So this is a DOM
 * patch under `docs/adr/0002-official-channels-first.md`: it reads only the two
 * stable anchors the host maintains (`data-composer-input` for the subtree,
 * `data-composer-text-ref` for the decoration) and writes only its own
 * attribute. `watch.ts` records what the upstream channel would have to look
 * like for this patch to be deleted.
 *
 * The tweak owns two resources, both registered through `ctx.effect` so the
 * host's own unload path releases them: the stylesheet, and the watch that
 * reconciles the marks.
 *
 * Owned by ticket #3.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight
 */

import type { EffectScope } from '../../effect.ts'
import type { ComposerDocumentLike, MutationObserverConstructor } from './watch.ts'
import { installStyles } from '../../dom/styles.ts'
import { referenceHighlightCss } from './styles.ts'
import { installDecorationWatch } from './watch.ts'

/** Effect-label prefix, so this feature's resources are identifiable in diagnostics. */
const LABEL = 'dsh-tweaks: reference-highlight'

/** The page globals this patch needs, or nothing outside a browser. */
interface BrowserPage {
  readonly document: ComposerDocumentLike
  readonly MutationObserver: MutationObserverConstructor
}

/**
 * Read the two page globals this patch needs.
 *
 * The ambient `document` and `MutationObserver` declarations describe a wider
 * surface than this plugin's own narrow `DocumentLike`. `documentElement`, for
 * instance, is a `ParentNode | null` in the DOM's own types, which the
 * structural type rules out; the plugin is written against its own surface on
 * purpose. So the globals are read here as `unknown`, checked for presence, and
 * handed on through the structural types. That keeps the one place where the
 * two DOM vocabularies meet explicit rather than an assertion buried in the
 * patch body. The artifact contract check also runs this code in a bare VM
 * context with no `document` at all, which is what the presence check is for.
 * @returns the page globals, or undefined when the page is not a browser.
 */
function browserPage(): BrowserPage | undefined {
  const document: unknown = Reflect.get(globalThis, 'document')
  const Observer: unknown = Reflect.get(globalThis, 'MutationObserver')
  if (document === undefined || document === null || typeof Observer !== 'function')
    return undefined
  return {
    document: document as ComposerDocumentLike,
    MutationObserver: Observer as MutationObserverConstructor,
  }
}

/**
 * Install the reference-highlight tweak.
 *
 * The parameter is the cordis context's effect scope rather than the whole
 * client context: this feature needs nothing else, and a narrower parameter is
 * what lets the install/uninstall path be driven in a test by the recording
 * scope, with no cast and no fabricated host. A context satisfies it
 * structurally, which is how `src/client/index.ts` passes one.
 *
 * Returns without registering anything when the page has no document or no
 * `MutationObserver`: the artifact is also materialized outside a browser, and
 * a feature that owns resources it cannot use would only add noise to the
 * uninstall path.
 * @param ctx - the effect scope to own the feature's resources.
 */
export function install(ctx: EffectScope): void {
  const page = browserPage()
  if (page === undefined)
    return
  const { document } = page
  const Observer = page.MutationObserver

  // The override is a stylesheet, not an inline style: the host re-creates the
  // decoration's element on every re-derivation, and a style attribute would
  // have to be rewritten on each one. The marker attribute survives that, and
  // the rule is installed and removed as one element.
  ctx.effect(() => installStyles(document, referenceHighlightCss()), `${LABEL}: styles`)

  // Text edits do not change any attribute of the decoration, so nothing about
  // the host's own DOM events would notice them; the watch is what re-derives
  // the marks. Its disposer disconnects the observer and takes the marks off.
  ctx.effect(() => installDecorationWatch(document, Observer), `${LABEL}: decoration watch`)
}
