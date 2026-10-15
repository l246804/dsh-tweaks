/**
 * CSS selector text for the plugin's own DOM markers.
 *
 * Every DOM patch in this plugin locates the host's nodes through attributes,
 * never through hashed CSS-module class names or element identity. Building
 * those selectors here keeps the escaping in one place and keeps the decision
 * pure, so it is testable without a document.
 *
 * @module @leiwang2000/dsh-tweaks/client/dom/selector
 */

/**
 * Escape a value for the inside of a double-quoted CSS attribute selector.
 *
 * A CSS string cannot carry a raw quote, backslash or newline; each becomes a
 * hex escape followed by a space, which terminates the escape unambiguously.
 * @param value - the raw attribute value.
 * @returns the escaped value, without the surrounding quotes.
 */
export function escapeAttributeValue(value: string): string {
  let escaped = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    // Control characters, DEL and the two characters that would end or break
    // the string are escaped; everything else survives verbatim.
    if (code < 0x20 || code === 0x7F || character === '"' || character === '\\') {
      escaped += `\\${code.toString(16)} `
      continue
    }
    escaped += character
  }
  return escaped
}

/**
 * Build an attribute selector, with or without an expected value.
 * @param attribute - the attribute name, as written in the document.
 * @param value - the exact value to match; omit to match on presence alone.
 * @returns selector text such as `[data-dsh-tweaks-panel]`.
 * @throws {Error} when the attribute name is empty.
 */
export function attributeSelector(attribute: string, value?: string): string {
  if (attribute === '')
    throw new Error('attributeSelector: attribute name must not be empty')
  if (value === undefined)
    return `[${attribute}]`
  return `[${attribute}="${escapeAttributeValue(value)}"]`
}

/**
 * Build a selector matching an attribute whose value contains a substring.
 *
 * Used for hashed class suffixes, where only the stable `_local` tail of a
 * CSS-module class name is knowable across builds.
 * @param attribute - the attribute name.
 * @param fragment - the substring the value must contain.
 * @returns selector text such as `[class*="_openable"]`.
 * @throws {Error} when either argument is empty.
 */
export function attributeContainsSelector(attribute: string, fragment: string): string {
  if (attribute === '')
    throw new Error('attributeContainsSelector: attribute name must not be empty')
  if (fragment === '')
    throw new Error('attributeContainsSelector: fragment must not be empty')
  return `[${attribute}*="${escapeAttributeValue(fragment)}"]`
}

/**
 * Join selector parts into one compound selector.
 * @param parts - selector fragments, applied to the same element.
 * @returns the joined selector.
 * @throws {Error} when no part is supplied.
 */
export function compoundSelector(...parts: readonly string[]): string {
  if (parts.length === 0)
    throw new Error('compoundSelector: at least one part is required')
  return parts.join('')
}
