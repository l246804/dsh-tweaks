/**
 * One attribute `data-*` name and its mapping to a `dataset` key.
 *
 * The DOM's `dataset` view and its attribute view are two names for the same
 * value: `data-dsh-tweaks-panel` is `dataset.dshTweaksPanel`. Plugin code and
 * tests use both, so the mapping lives here instead of being re-derived.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/dataset
 */

/**
 * Convert an attribute name to its `dataset` key.
 * @param attribute - an attribute name such as `data-dsh-tweaks-panel`.
 * @returns the dataset key, such as `dshTweaksPanel`.
 * @throws {Error} when the name is not a `data-` attribute.
 */
export function datasetKey(attribute: string): string {
  if (!attribute.startsWith('data-') || attribute.length <= 'data-'.length) {
    throw new Error(`datasetKey: ${JSON.stringify(attribute)} is not a data-* attribute`)
  }
  return attribute
    .slice('data-'.length)
    .replace(/-([a-z0-9])/gu, (_match, character: string) => character.toUpperCase())
}

/**
 * Convert a `dataset` key back to its attribute name.
 * @param key - a dataset key such as `dshTweaksPanel`.
 * @returns the attribute name, such as `data-dsh-tweaks-panel`.
 * @throws {Error} when the key is empty or already carries a `data-` prefix.
 */
export function attributeName(key: string): string {
  if (key === '')
    throw new Error('attributeName: dataset key must not be empty')
  if (key.startsWith('data-')) {
    throw new Error(`attributeName: ${JSON.stringify(key)} is already an attribute name`)
  }
  return `data-${key.replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`
}
