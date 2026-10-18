/**
 * Every attribute this plugin reads or reproduces from the host, named once,
 * with the package that writes it.
 *
 * ADR-0002 allows DOM patches only through **stable anchors**, and the failure
 * mode it warns about is silent: upstream renames an attribute, the patch keeps
 * building, and it stops matching anything at runtime. Two things hold that
 * line, and both need the anchors to have one home:
 *
 * - `scripts/check-anchors.mjs` reads every declaration below and verifies each
 *   name still appears in the pinned upstream tree, under the package that
 *   owns it. It scans this file's text, so a new entry is covered by adding it
 *   to any of the groups here, with no second list to keep in step.
 * - ESLint forbids host attribute literals outside this directory, so a new
 *   patch cannot quietly introduce a name the check never sees.
 *
 * The `owner` of each entry is the upstream package that writes the attribute,
 * which is what makes a failed check actionable: it names the package whose
 * markup moved.
 *
 * This module holds *names*, not meaning. The reading of a name ("what value
 * means docked", "which of a tab's two seats is its body") lives with the
 * patch that needs it, because those are judgements the check cannot verify.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/host-anchors
 */

/** One host attribute: its spelling, and the upstream package that writes it. */
export interface HostAnchor {
  /** The attribute name exactly as the host writes it. */
  readonly name: string
  /** The upstream package that owns the markup carrying it. */
  readonly owner: string
}

/**
 * The docking kit's anchors, written by `ui-dockkit` and `ui-sidebar-right`.
 *
 * These are what the file panel and the tab actions read to find a tab's
 * section, its seats, and where it stands.
 */
export const DOCKKIT_ANCHORS = {
  /** One tab's own `<section>`; exists for every tab record, selected or not. */
  content: { name: 'data-dockkit-content', owner: 'client/ui-dockkit' },
  /** Where a tab stands: on the docked surface or in a floating pane. */
  host: { name: 'data-dockkit-host', owner: 'client/ui-dockkit' },
  /** The floating pane that draws a tab. */
  float: { name: 'data-dockkit-float', owner: 'client/ui-sidebar-right' },
  /** One chip of a pane's tab strip, carrying the tab id. */
  tab: { name: 'data-dockkit-tab', owner: 'client/ui-dockkit' },
  /** The chips container of one pane's strip, carrying the pane id. */
  stripTabs: { name: 'data-dockkit-strip-tabs', owner: 'client/ui-dockkit' },
  /** The box wrapping a strip chip's label. Title chrome, never a body. */
  tabTitle: { name: 'data-dockkit-tab-title', owner: 'client/ui-dockkit' },
  /** The box wrapping a floating pane's title. Title chrome, never a body. */
  floatTitle: { name: 'data-dockkit-float-title', owner: 'client/ui-dockkit' },
  /** A floating pane's header, which holds its title. Title chrome. */
  floatGrip: { name: 'data-dockkit-float-grip', owner: 'client/ui-dockkit' },
} as const satisfies Record<string, HostAnchor>

/**
 * The right sidebar's anchors.
 *
 * `tab` is written on **both** seats of a tab (the chip title and the body),
 * which is why reading it alone is never enough to find a body.
 * `session` scopes every read to one Session's panel, so a retained background
 * Session cannot contribute its tabs.
 */
export const SIDEBAR_RIGHT_ANCHORS = {
  /** A tab's seats: the chip title and the body both carry the tab id. */
  tab: { name: 'data-sidebar-right-tab', owner: 'client/ui-sidebar-right' },
  /** One Session's panel, the scope every read starts from. */
  session: { name: 'data-sidebar-right-session', owner: 'client/ui-sidebar-right' },
} as const satisfies Record<string, HostAnchor>

/**
 * The document preview's anchors, written by `ui-sidebar-documentpreview`.
 *
 * A file tab's body is a preview. `state` is the root and carries the preview's
 * state in its value; the preview's own toolbar row carries no attribute of its
 * own, so it is found through the `path` label inside it.
 */
export const TEXT_PREVIEW_ANCHORS = {
  /** The preview root; its value is one of `text` / `unsupported` / `loading`. */
  state: { name: 'data-textpreview-state', owner: 'client/ui-sidebar-documentpreview' },
  /** The path label inside the preview's toolbar row. */
  path: { name: 'data-textpreview-path', owner: 'client/ui-sidebar-documentpreview' },
  /** The preview's body, where the file's content is drawn. */
  body: { name: 'data-textpreview-body', owner: 'client/ui-sidebar-documentpreview' },
  /** The change notice drawn above the toolbar when the file changed underneath. */
  changed: { name: 'data-textpreview-changed', owner: 'client/ui-sidebar-documentpreview' },
  /** The change notice's failure variant; the same row as `changed`. */
  metaFailed: { name: 'data-textpreview-meta-failed', owner: 'client/ui-sidebar-documentpreview' },
} as const satisfies Record<string, HostAnchor>

/**
 * The built-in files tree's anchors, written by `ui-sidebar-files`.
 *
 * Reproduced on this plugin's own rows so the takeover is indistinguishable
 * from the tree it replaced: they are the host's vocabulary borrowed for
 * presentation, not this plugin's identity (see `markers.ts`).
 */
export const FILES_TREE_ANCHORS = {
  /** What a row is: a directory, a file, or something else. */
  entry: { name: 'data-files-entry', owner: 'client/ui-sidebar-files' },
  /** A row's workspace path. */
  path: { name: 'data-files-path', owner: 'client/ui-sidebar-files' },
} as const satisfies Record<string, HostAnchor>

/**
 * The chat row's anchors, written by `ui-chat`.
 *
 * A `copy` event carries no React props, so these two are how the plugin
 * recovers which message a selection belongs to.
 */
export const CHAT_ROW_ANCHORS = {
  /** A chat row's renderer kind. */
  flowKind: { name: 'data-chat-flow-kind', owner: 'client/ui-chat' },
  /** A chat row's conversation context key. */
  nodeKey: { name: 'data-chat-node-key', owner: 'client/ui-chat' },
  /** Whether a row is an earlier one, whose action line hides until hover. */
  actionsReveal: { name: 'data-actions-reveal', owner: 'client/ui-chat' },
  /** Which side of the action line the clock sits on. */
  clock: { name: 'data-clock', owner: 'client/ui-chat' },
} as const satisfies Record<string, HostAnchor>
