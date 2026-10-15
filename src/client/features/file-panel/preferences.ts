/**
 * The panel's remembered preferences.
 *
 * One preference today: whether the file list is shown beside a file's content.
 * The issue asks for it to be on by default and to survive a reload, which is
 * two different statements: the default is what a reader who has never chosen
 * gets, and "survives a reload" is a write the plugin must own.
 *
 * `localStorage` is the host's own preference store for sidebar layout (the
 * right sidebar persists its per-session layout there), so the panel uses the
 * same place and the same discipline: one namespaced key, a failure to read or
 * write is not an error the reader cares about, and the default covers both.
 *
 * The storage face is a parameter, not `globalThis.localStorage`, so the
 * defaulting and the write path are testable in a plain Node process. More
 * to the point, so a browser that refuses storage (private mode, a disabled
 * origin) degrades to the default instead of throwing during install.
 *
 * @module @leiwang2000/dsh-tweaks/client/features/file-panel/preferences
 */

/** The key this plugin owns. Namespaced by the package so no other plugin can collide. */
export const PREFERENCE_KEY = 'dsh-tweaks:file-panel:visible'

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
