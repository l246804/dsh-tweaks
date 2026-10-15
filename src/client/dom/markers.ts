/**
 * The plugin's own DOM markers.
 *
 * Every DOM patch in this plugin confines its writes to elements carrying one
 * of these attributes. Two properties matter:
 *
 * - A marker is the plugin's own, so uninstalling is a `querySelectorAll` and a
 *   `removeAttribute` per match, so the host's nodes and attributes are never
 *   touched, and no residue can survive.
 * - A test can ask "is this plugin currently applied?" by looking for the
 *   marker alone, without knowing anything about the patch that wrote it.
 *
 * The `dsh-tweaks` prefix keeps the namespace unambiguous next to the host's
 * own `data-` attributes.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/markers
 */

/** Marks the plugin-owned style element carrying this plugin's CSS overrides. */
export const STYLE_ELEMENT_MARKER = 'data-dsh-tweaks-style'
