/**
 * The panel's remembered preferences.
 *
 * Two preferences today: whether the file panel is shown beside a file's
 * content, and how wide it is. The issue asks for the first to be on by default
 * and to survive a reload, which is two different statements: the default is
 * what a reader who has never chosen gets, and "survives a reload" is a write
 * the plugin must own. The second is a drag the reader performs, and a width
 * that did not survive a reload would have to be re-dragged every session.
 *
 * `localStorage` is the host's own preference store for sidebar layout (the
 * right sidebar persists its per-session layout there), so the panel uses the
 * same place and the same discipline: one namespaced key per preference, a
 * failure to read or write is not an error the reader cares about, and the
 * default covers both.
 *
 * The width has two bounds that are not the reader's to choose: a floor that
 * keeps a path readable and a ceiling that keeps the file's own content usable.
 * The ceiling is a *fraction of the tab body*, not a constant, because the same
 * 400px panel is a third of a wide pane and all of a narrow one. Both bounds
 * live here, as pure arithmetic, so the drag handler and the stored value are
 * clamped by one implementation rather than two.
 *
 * The storage face is a parameter, not `globalThis.localStorage`, so the
 * defaulting and the write path are testable in a plain Node process. More
 * to the point, so a browser that refuses storage (private mode, a disabled
 * origin) degrades to the default instead of throwing during install.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/preferences
 */

/** The key the visibility preference owns. Namespaced by the package so no other plugin can collide. */
export const PREFERENCE_KEY = 'dsh-tweaks:file-panel:visible'

/** The key the panel's width owns. */
export const WIDTH_PREFERENCE_KEY = 'dsh-tweaks:file-panel:width'

/** The width the panel starts at, and the width a double-click on the handle restores. */
export const PANEL_DEFAULT_WIDTH = 260

/** The narrowest the panel may be dragged: below this a path is unreadable. */
export const PANEL_MIN_WIDTH = 180

/**
 * The widest the panel may be dragged, as a fraction of the tab body.
 *
 * Half is the ceiling because the file the panel sits beside must keep a usable
 * share of the same row: a panel that can take everything would let a reader
 * drag the content they are reading down to nothing, and the tab's own toolbar
 * spans the body, so there is no second place to grab it back from.
 */
const PANEL_MAX_WIDTH_RATIO = 0.5

/**
 * The widest the panel may be inside a body of this width.
 *
 * A body narrower than the floor yields the floor rather than a negative or
 * zero bound: the panel then overflows its half, which is the honest answer for
 * a pane too narrow for two columns, and the reader still has a readable list.
 * @param hostWidth - the tab body's width in pixels, or 0 when it is not measured.
 * @returns the ceiling in pixels, never below {@link PANEL_MIN_WIDTH}.
 */
export function maxPanelWidth(hostWidth: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.round(hostWidth * PANEL_MAX_WIDTH_RATIO))
}

/**
 * Bring a width inside the panel's bounds.
 *
 * A width that is not a finite number (a corrupted store, a measurement of a
 * hidden element) falls back to the default rather than propagating `NaN` into
 * a CSS length, which would silently collapse the panel.
 *
 * An unmeasured body (`hostWidth` of 0, or a negative measurement) applies only
 * the floor: the ceiling is a fraction of a width nobody has read yet, and
 * inventing one would shrink a legitimate preference.
 * @param width - the proposed width in pixels.
 * @param hostWidth - the tab body's width in pixels, or 0 when it is not measured.
 * @returns the width to apply.
 */
export function clampPanelWidth(width: number, hostWidth: number): number {
  if (!Number.isFinite(width))
    return PANEL_DEFAULT_WIDTH
  const ceiling = hostWidth > 0 ? maxPanelWidth(hostWidth) : Number.POSITIVE_INFINITY
  return Math.max(PANEL_MIN_WIDTH, Math.min(ceiling, Math.round(width)))
}

/** The smallest storage surface this module needs. `Storage` satisfies it. */
export interface PreferenceStorage {
  /**
   * Read one key.
   * @param key - the key.
   * @returns the stored string, or null when it is absent.
   */
  readonly getItem: (key: string) => string | null
  /**
   * Write one key.
   * @param key - the key.
   * @param value - the value.
   */
  readonly setItem: (key: string, value: string) => void
}

/**
 * Read the stored visibility preference.
 *
 * Anything other than an explicit `'false'` means shown. That is deliberate: a
 * missing key, a corrupted value and a storage that throws all mean "the reader
 * has not turned it off", and the issue's default is on.
 * @param storage - the storage to read, or undefined when there is none.
 * @returns the remembered value, or the default.
 */
export function readVisiblePreference(storage: PreferenceStorage | undefined): boolean {
  if (storage === undefined)
    return true
  try {
    return storage.getItem(PREFERENCE_KEY) !== 'false'
  }
  catch {
    // A storage that refuses reads (private mode, a hardened origin) is not a
    // reason to fail install; the default is the answer.
    return true
  }
}

/**
 * Remember the visibility preference.
 * @param storage - the storage to write, or undefined when there is none.
 * @param visible - the value to remember.
 */
export function writeVisiblePreference(storage: PreferenceStorage | undefined, visible: boolean): void {
  if (storage === undefined)
    return
  try {
    storage.setItem(PREFERENCE_KEY, visible ? 'true' : 'false')
  }
  catch {
    // A full or frozen store loses the preference, not the session.
  }
}

/**
 * Read the stored panel width.
 *
 * Only the floor is applied here. The ceiling depends on how wide the tab body
 * is *right now*, which is a browser measurement this module deliberately does
 * not perform: the drag handler clamps against the measured width while the
 * reader drags, and the stylesheet's own `max-width` catches a width saved on a
 * wide window and read back on a narrow one. Clamping a restored value against
 * a width nobody has measured yet would quietly shrink a legitimate preference
 * to the floor.
 * @param storage - the storage to read, or undefined when there is none.
 * @returns the width to apply, never below the floor.
 */
export function readWidthPreference(storage: PreferenceStorage | undefined): number {
  if (storage === undefined)
    return PANEL_DEFAULT_WIDTH
  try {
    const stored = storage.getItem(WIDTH_PREFERENCE_KEY)
    if (stored === null)
      return PANEL_DEFAULT_WIDTH
    const parsed = Number.parseFloat(stored)
    if (!Number.isFinite(parsed))
      return PANEL_DEFAULT_WIDTH
    return Math.max(PANEL_MIN_WIDTH, Math.round(parsed))
  }
  catch {
    // A storage that refuses reads is not a reason to fail install.
    return PANEL_DEFAULT_WIDTH
  }
}

/**
 * Remember the panel width.
 *
 * The unclamped value is written on purpose. A drag that stops at the ceiling
 * because the window was narrow would otherwise persist that constrained width
 * as the reader's choice, and widening the window would not restore it.
 * @param storage - the storage to write, or undefined when there is none.
 * @param width - the value to remember.
 */
export function writeWidthPreference(storage: PreferenceStorage | undefined, width: number): void {
  if (storage === undefined || !Number.isFinite(width))
    return
  try {
    storage.setItem(WIDTH_PREFERENCE_KEY, String(Math.round(width)))
  }
  catch {
    // A full or frozen store loses the preference, not the session.
  }
}

/**
 * The browser's own storage, when there is one.
 * @returns the storage, or undefined outside a browser or when access throws.
 */
export function browserStorage(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage
  }
  catch {
    // Reading the property itself throws when storage is blocked by policy.
    return undefined
  }
}
