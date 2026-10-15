/**
 * Is this decoration a reference, or the host's syntax guess at one?
 *
 * The host derives a reference decoration from two unrelated sources, and both
 * land in the same DOM node with the same styling:
 *
 * - The `/` trigger's tokens come from the trigger source's lexicon, i.e. the
 *   user picked a real target. Their text is a trigger character plus `[\w-]+`
 *   (upstream `input/decorations.ts:24`).
 * - The `@` trigger's tokens come from a folder guess that consults no lexicon
 *   at all: `/(^|\s)(@(?:"[^"\n]*\/|[^\s"]+\/))/g` (upstream
 *   `input/decorations.ts:25`). Any hand-typed `@scope/xxx` matches, and the
 *   decoration covers the token up to its last separator.
 *
 * Two consequences shape the reading below. A guessed token always contains a
 * separator, because the guess cannot match without one, while a lexicon token
 * never does, because `[\w-]+` excludes it. And the guess is exactly what
 * nobody selected, so it must not look like a reference.
 *
 * The host also states something itself: it adds its `<hash>_openable` class to
 * a decoration whose text starts with `/` (upstream `input/editor/text-ref.ts:55`),
 * meaning "this token names something that can be opened". That is a stronger
 * claim than this plugin can make from text alone, so it wins: a decoration the
 * host calls openable keeps its look. Today the two readings cannot disagree,
 * since `_openable` is exactly `startsWith('/')`, so this is a hedge rather
 * than a rule in force. It is written down because it is the one place the
 * tweak's effect could silently stop applying, and it is one clause to delete
 * if upstream ever marks an `@` guess openable. See "Known limits" below.
 *
 * Pure on purpose: this is the whole judgement, so it can be exercised without
 * a document, and re-aimed when the host's matcher changes.
 *
 * Known limits:
 *
 * - If upstream changes `_openable` to cover `@` guesses, this classifier keeps
 *   them highlighted, because the host's claim is taken to outrank the shape.
 *   The fix is to drop the `isOpenable` clause and the row asserting it.
 * - The host writes `_openable` once, in the decoration's `createDOM`, and
 *   never revisits it. A node whose text changes shape while keeping its
 *   element would carry a stale claim. That cannot happen through the folder
 *   guess: reaching an `@`-slash token there dissolves the entity node and a
 *   fresh one is created. So the clause is not currently reachable in the
 *   wrong direction either.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/reference-highlight/decision
 */

/** What a decoration should look like. */
export type ReferenceAppearance = 'reference' | 'plain'

/** The facts a decoration exposes that the judgement depends on. */
export interface ReferenceDecorationFacts {
  /** The decoration's text, exactly as the host wrote it. */
  readonly text: string
  /**
   * The decoration's `class` attribute, or null/undefined when it has none.
   * Only the host's own `_openable` claim is read out of it.
   */
  readonly className: string | null | undefined
}

/**
 * The stable tail of the host's "this token can be opened" class.
 *
 * A CSS-module class is `<hash>_<local>` (`tsdown.client.ts:593`), so the hash
 * changes per build and only the local part is knowable. Matched as a whole
 * class token, never as a substring: a longer local such as `_openableLater`
 * is a different class.
 */
const OPENABLE_CLASS_SUFFIX = '_openable'

/**
 * Whether the host marked this decoration openable.
 * @param className - the decoration's `class` attribute, if any.
 * @returns true when one of its class tokens is the host's openable flag.
 */
function isOpenableClass(className: string | null | undefined): boolean {
  if (className === null || className === undefined || className === '')
    return false
  return className.split(/\s+/u).some(token => token.endsWith(OPENABLE_CLASS_SUFFIX))
}

/**
 * Decide whether a decoration keeps the reference look.
 * @param facts - the decoration's text and its `class` attribute.
 * @returns `plain` to take the reference look away, `reference` to leave it.
 */
export function classifyReferenceDecoration(facts: ReferenceDecorationFacts): ReferenceAppearance {
  // The host calls it openable, so it decided the token names a target; a claim
  // about the same node beats an inference from its text.
  if (isOpenableClass(facts.className))
    return 'reference'
  // Only the `@` trigger guesses from syntax; a `/` token is a lexicon hit.
  if (!facts.text.startsWith('@'))
    return 'reference'
  // A guess always spans a separator, a lexicon name never can. Without a
  // separator this is not the guess, so it is not this tweak's to restyle.
  return facts.text.includes('/') ? 'plain' : 'reference'
}
