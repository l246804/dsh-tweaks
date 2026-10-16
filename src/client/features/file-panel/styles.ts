/**
 * The panel's stylesheet, and the layout facts it owns.
 *
 * The tree's own numbers are the built-in tree's, copied value for value: a
 * reader who has used the shipped files tab must not be able to tell that a
 * plugin took the type over. What the panel adds on top of that copy is the four
 * things the takeover needs and the built-in tree never had:
 *
 * 1. **The one scroller.** The filter row sits above the tree and outside its
 *    scroller, so scrolling cannot carry the filter away. Both are children of
 *    the tree's own root element (`.root`), which is why rules hanging the
 *    filter and the body directly off the panel container reached nothing: the
 *    container holds `.root`, and `.root` is what holds them. Without a
 *    `flex-direction: column` height chain from the container down to that
 *    scroller there is no definite height to scroll inside, and the tree simply
 *    does not scroll.
 * 2. **The file-list page's 38px header.** The built-in tab draws the root path
 *    and a reload button above the tree; taking the type over must not delete
 *    them, and the filter row belongs *under* that header rather than in its
 *    place.
 * 3. **The side-by-side dock, as a grid.** Docked in a *file* tab, the host is
 *    the preview's own root, and the panel takes its right-hand column while
 *    the preview's 38px toolbar row spans both columns, so it keeps reading as
 *    the tab's toolbar instead of stopping at the seam. The host's own
 *    `display: flex` and `flex-direction: column` are beaten on specificity
 *    (two attribute selectors against one hashed class name), never with
 *    `!important`.
 * 4. **The resize handle.** A zero-width box on the seam whose pseudo-elements
 *    carry the hairline and the 8px pointer target, which is how the docking
 *    kit's own divider is built.
 *
 * The dock rules are anchored on the host's own `data-*` attributes rather than
 * on its CSS-module class names: those carry a build hash, so a rule written
 * against one would break on the next build. Where a node has no attribute of
 * its own (the preview's toolbar row) the rule uses `:has()` over a marker
 * that is inside it, which is the same technique the preview's own sheet uses
 * (`.body:has([data-code-preview])`).
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/styles
 */

import { PANEL_CONTAINER_ATTRIBUTE, PANEL_HOST_ATTRIBUTE } from './panel-host.ts'

/**
 * The custom property the panel's width is written to.
 *
 * The width is written on the panel's container (`resizer.ts`), not on the
 * element the width applies to, because the container is the one node the panel
 * owns for its whole life. The declaration below carries a fallback so a panel
 * that has never been measured, or never dragged, still has a width.
 */
export const PANEL_WIDTH_VARIABLE = '--dsh-tweaks-file-panel-width'

/** The fallback width, repeated from `preferences.ts` because CSS cannot import it. */
const WIDTH_FALLBACK = '260px'

/** The preview root's marker, which is where the dock host is. */
const PREVIEW_STATE_ATTRIBUTE = 'data-textpreview-state'

/** The path label inside the preview's toolbar row, the only marker that row carries. */
const PREVIEW_PATH_ATTRIBUTE = 'data-textpreview-path'

/** The preview's body, where the file's content is drawn. */
const PREVIEW_BODY_ATTRIBUTE = 'data-textpreview-body'

/**
 * The preview's change notice, which is drawn above the toolbar when the file
 * changed underneath the reader. Either marker means the same row.
 */
const PREVIEW_NOTICE_ATTRIBUTES: readonly string[] = ['data-textpreview-changed', 'data-textpreview-meta-failed']

/**
 * The docked preview root: the element the panel is docked beside.
 * @returns selector text.
 */
export function previewDockSelector(): string {
  return `[${PREVIEW_STATE_ATTRIBUTE}][${PANEL_HOST_ATTRIBUTE}='dock']`
}

/**
 * The preview's toolbar row inside the docked root.
 *
 * The row carries no attribute of its own, so it is identified by the path label
 * it holds; a row that is missing means the other children simply lay out as
 * full-width content, which is the same answer this rule gives.
 * @returns selector text.
 */
export function previewToolbarSelector(): string {
  return `${previewDockSelector()} > :has([${PREVIEW_PATH_ATTRIBUTE}])`
}

/**
 * The preview's body inside the docked root.
 * @returns selector text.
 */
export function previewBodySelector(): string {
  return `${previewDockSelector()} > [${PREVIEW_BODY_ATTRIBUTE}]`
}

/**
 * The docked root in the preview's `loading` state.
 *
 * That state is not a container with a status line inside it: the element
 * carrying the marker *is* the box, and its own hashed class centres the one
 * line it draws. Its children are a status line and, once docked, the panel, so
 * the grid has to be told what that class used to do with flex.
 * @returns selector text.
 */
export function previewLoadingSelector(): string {
  return `[${PREVIEW_STATE_ATTRIBUTE}='loading'][${PANEL_HOST_ATTRIBUTE}='dock']`
}

/**
 * The tree's scroller: the one element in the panel that scrolls.
 * @returns selector text.
 */
export function panelScrollerSelector(): string {
  return `[${PANEL_CONTAINER_ATTRIBUTE}] .root > .body`
}

/**
 * The panel's stylesheet.
 *
 * Every value comes from the theme tokens the built-in tree uses, so the panel
 * follows the active theme instead of pinning colors of its own.
 * @returns the stylesheet text.
 */
export function panelStyles(): string {
  return `
[${PANEL_HOST_ATTRIBUTE}='page'] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* The dock on a tab body wrapper: the host the panel falls back to when the
   preview's own root is not on the page. Two children, both shrinking, the
   preview taking what is left. */
[${PANEL_HOST_ATTRIBUTE}='dock'] {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
}

/* The dock on the preview's own root. The preview lays itself out as a flex
   column (its own module's class, one selector deep), so this rule has to
   outrank that class without \`!important\`; two attribute selectors do.

   Three rows, deliberately: the first is reserved for the change notice, the
   second is the preview's own toolbar row, and the third is what is left over.
   An \`auto\` track with no item in it collapses to nothing, so the toolbar sits
   directly under the pane's strip when there is no notice, and below it when
   there is one. The leftover column is the flexible one, so it is the third
   track: a flexible track is expanded before the stretch step runs, which is
   what keeps the two \`auto\` tracks at their content height. */
${previewDockSelector()} {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* Everything the panel was not told about is the preview's content: the left
   column, in the flexible row. That covers the \`loading\` state, whose only child
   is a status line and which has neither a toolbar row nor a body marker; a state
   the host adds later lands here too instead of breaking the layout. */
${previewDockSelector()} > :not([${PANEL_CONTAINER_ATTRIBUTE}]) {
  grid-column: 1;
  grid-row: 3;
}

/* The change notice and the toolbar row span both columns, so the panel starts
   below them rather than beside them. */
${PREVIEW_NOTICE_ATTRIBUTES.map(attribute => `${previewDockSelector()} > [${attribute}]`).join(',\n')} {
  grid-column: 1 / -1;
  grid-row: 1;
}

${previewToolbarSelector()} {
  grid-column: 1 / -1;
  grid-row: 2;
}

/* The preview's content, in the left column of the flexible row. */
${previewBodySelector()} {
  grid-column: 1;
  grid-row: 3;
}

/* The panel, in the right column of the same row. */
${previewDockSelector()} > [${PANEL_CONTAINER_ATTRIBUTE}] {
  grid-column: 2;
  grid-row: 3;
}

/* The loading state. Its marker sits on the status box itself rather than on a
   wrapper, so the panel becomes a second child of a box whose own class was
   written for one centred line. Three of those declarations would show now that
   the box is a two-column grid: the box's padding would inset the panel from the
   panel's own edges, its row gap would open a seam between the columns, and its
   item alignment would size the panel to its content instead of the row. The
   centring it meant is handed to the line itself. */
${previewLoadingSelector()} {
  align-items: stretch;
  gap: 0;
  padding: 0;
}

${previewLoadingSelector()} > :not([${PANEL_CONTAINER_ATTRIBUTE}]) {
  grid-column: 1;
  grid-row: 3;
  align-self: center;
  justify-self: center;
  max-width: 100%;
  padding: 12px 10px;
}

${previewLoadingSelector()} > [${PANEL_CONTAINER_ATTRIBUTE}] {
  grid-column: 2;
  grid-row: 3;
}

[${PANEL_HOST_ATTRIBUTE}='dock'] > * {
  min-width: 0;
  min-height: 0;
}

[${PANEL_HOST_ATTRIBUTE}='dock'] > [${PANEL_CONTAINER_ATTRIBUTE}] {
  flex: 0 0 auto;
  width: var(${PANEL_WIDTH_VARIABLE}, ${WIDTH_FALLBACK});
}

/* The ceiling, but only where a percentage has a definite basis to resolve
   against: the flex row's own width. The grid host is excluded deliberately,
   because there the panel's containing block is the content-sized track the
   panel itself sizes, so a percentage would be resolved against the very width
   it is meant to cap (a 800px panel capped at "50%" of its own 800px track).
   There the ceiling is \`clampPanelWidth\`'s, applied against the measured host on
   every write, including the first. */
[${PANEL_HOST_ATTRIBUTE}='dock']:not([${PREVIEW_STATE_ATTRIBUTE}]) > [${PANEL_CONTAINER_ATTRIBUTE}] {
  max-width: 50%;
}

[${PANEL_HOST_ATTRIBUTE}='page'] > [${PANEL_CONTAINER_ATTRIBUTE}] {
  flex: 1 1 auto;
  min-height: 0;
}

[${PANEL_CONTAINER_ATTRIBUTE}] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
  background: var(--dsw-alias-bg-base);
}

/* The tree's own root: the page header, then the filter row, then the scroller.
   Values copied from the built-in tree's .root, which is what gives the scroller
   a definite height to scroll inside. Positioned so the resize handle can hang
   on the seam without taking layout room. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
}

/* The file-list page's own 38px row: the root path, then reload at its end.
   Values copied from the built-in tree's .header, values and all. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .header {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  align-items: center;
  box-sizing: border-box;
  height: 38px;
  padding: 0 6px 0 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

/* The margin plus the header's gap keeps the path 16px clear of reload. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .header > .path {
  margin-right: 12px;
}

/* The same icon button as the Sidebar's strip controls: a 28px circle around a
   15px glyph. Values copied from the built-in tree's .tool. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .header > .tool {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: none;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .header > .tool svg {
  width: 15px;
  height: 15px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .header > .tool:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

/* The filter row: under the header when there is one, above the tree always,
   and inside the tree's own column so the tree's scroll cannot carry it away.
   A one-column grid rather than a flex row, because the input is the shared
   primitive: its wrapper is the primitive's own hashed class, and a grid item
   stretches to its track without this sheet reaching into that class. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .filter {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr);
  padding: 8px 10px 6px;
}

/* The scroller. Values copied from the built-in tree's .body. */
${panelScrollerSelector()} {
  flex: 1 1 auto;
  min-height: 0;
  margin-right: 2px;
  padding: 8px 0 8px 8px;
  overflow: auto;
  scrollbar-gutter: stable;
}

${panelScrollerSelector()}::-webkit-scrollbar-track {
  margin: 2px;
}

/* The seam handle: a zero-width box on the panel's left edge whose
   pseudo-elements do the drawing, exactly as the docking kit's own divider does
   it. The hairline is centred on the seam, and the hit target reaches 4px over
   each side; \`z-index\` keeps that overhang above the preview, which is painted
   first and would otherwise take the hit. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer {
  position: absolute;
  z-index: 1;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer::before,
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer::after {
  content: '';
  position: absolute;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer::before {
  top: 0;
  bottom: 0;
  left: -0.25px;
  width: 0.5px;
  background: var(--dsw-alias-border-l4);
}

/* The grip: a 1px line deepest at its middle and fading toward both ends,
   painted on the hit target and crossfaded through opacity, because a gradient
   cannot transition from the hairline's solid colour. It also stands in for the
   focus ring, so a keyboard reader sees the handle they just tabbed to. */
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer::after {
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
  opacity: 0;
  background: linear-gradient(to bottom, transparent, var(--dsw-alias-label-caption) 50%, transparent) center / 1px 100% no-repeat;
  transition: opacity 120ms ease-out;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer:hover::after,
[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer:focus-visible::after {
  opacity: 1;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .root > .resizer:focus-visible {
  outline: none;
}

/* Nesting, not inline indentation: copied from the built-in tree. */
[${PANEL_CONTAINER_ATTRIBUTE}] ul.level {
  margin: 0;
  padding: 0;
  list-style: none;
}

[${PANEL_CONTAINER_ATTRIBUTE}] ul.level ul.level {
  padding-left: 18px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] li.item {
  margin: 0;
  padding: 0;
}

/* A row. Values copied from the built-in tree's .row. */
[${PANEL_CONTAINER_ATTRIBUTE}] button.row,
[${PANEL_CONTAINER_ATTRIBUTE}] span.row {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 5px 10px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-md, 12px);
  cursor: pointer;
}

[${PANEL_CONTAINER_ATTRIBUTE}] button.row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* The current file. The built-in tree has no active state because it never
   needed one; the panel marks the row the active tab shows, and this is the
   only addition to the row's appearance. The hover fill is the active fill on
   purpose: the reader's eye reads "this is the row I am on" the same way it
   reads "this is the row I am about to pick", and the two fills differing would
   make one of the two states look wrong. */
[${PANEL_CONTAINER_ATTRIBUTE}] button.row[aria-current='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}

[${PANEL_CONTAINER_ATTRIBUTE}] .icon {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-tertiary);
}

[${PANEL_CONTAINER_ATTRIBUTE}] .fileIcon {
  flex: 0 0 auto;
}

/* The file-list tab's chip glyph. A flex child shrinks by default, and the chip
   is the narrowest place the glyph is drawn, so it has to be told not to; the
   built-in title said the same through a class of its own.

   Deliberately not scoped to the panel container: the chip is drawn on the tab,
   outside the panel, which is also why \`title.ts\` names the glyph with a class
   rather than one of the plugin's \`data-*\` markers (\`FileTypeIcon\` forwards only
   \`size\` and \`className\`). An unscoped class is safe here because \`title.ts\` is
   this name's only writer: every upstream title that draws the same glyph does
   it through a CSS-module class, whose runtime form carries a build hash. */
.titleIcon {
  flex: none;
}

/* The panel's toggle on a file tab's document toolbar. The values are the
   built-in tree's \`.tool\`, term for term, because the button sits between that
   package's own toolbar buttons and must not read as the odd one out; a bare
   \`<button>\` otherwise takes the browser's border, which is the one difference
   an eye catches immediately. The pressed state is the hover fill, which is
   also what the built-in tree's own pressed tool uses.

   Deliberately not scoped to the panel container, for the same reason as
   \`.titleIcon\` above: the toolbar is the preview's, not the panel's. The
   attribute is the plugin's own marker (\`toolbar.ts\`), which is what keeps an
   unscoped attribute rule safe. */
[data-dsh-tweaks-files-panel-toggle] {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: none;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

[data-dsh-tweaks-files-panel-toggle] svg {
  width: 15px;
  height: 15px;
}

[data-dsh-tweaks-files-panel-toggle]:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

[data-dsh-tweaks-files-panel-toggle][aria-pressed='true'] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

[${PANEL_CONTAINER_ATTRIBUTE}] .name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

[${PANEL_CONTAINER_ATTRIBUTE}] span.row.other {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

[${PANEL_CONTAINER_ATTRIBUTE}] span.row.other:hover {
  background: transparent;
}

/* State lines. Values copied from the built-in tree's .note. */
[${PANEL_CONTAINER_ATTRIBUTE}] li.note {
  margin: 0;
  padding: 3px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .status {
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
}

[${PANEL_CONTAINER_ATTRIBUTE}] .statusLine {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.6;
}
`
}
