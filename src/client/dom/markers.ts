/**
 * The plugin's own DOM markers, and the naming rule they follow.
 *
 * Every attribute this plugin writes for **its own** purposes carries the
 * `data-dsh-tweaks-` prefix. That is what keeps the namespace unambiguous next
 * to the host's own `data-` attributes (upstream writes ones such as
 * `data-dsh-automatic-focus`), and it is what makes uninstalling a
 * `querySelectorAll` over the plugin's own attributes rather than a guess about
 * the host's: the host's nodes and attributes are never touched, so no residue
 * can survive.
 *
 * The one exception is deliberate and is not a marker: where this plugin
 * reproduces the built-in tree's markup so a reader cannot tell the takeover
 * happened, it reproduces the host's own attribute spelling too
 * (`data-files-path`, `data-files-entry`; see `file-panel/view.ts`). Those are
 * the host's vocabulary borrowed for presentation, not the plugin's identity, so
 * prefacing them would defeat the purpose of copying them.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/markers
 */

/** Marks the plugin-owned style element carrying this plugin's CSS overrides. */
export const STYLE_ELEMENT_MARKER = 'data-dsh-tweaks-style'
