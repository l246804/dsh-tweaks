#!/usr/bin/env node
/**
 * Seam five: the glossary's live vocabulary, checked against the copy the
 * plugin actually shows.
 *
 * `GLOSSARY.md` names one term per concept and lists the words to *avoid* for
 * it. That rule is a judgement call: no linter can tell whether a sentence is
 * describing a right sidebar or a file panel, but a whole class of violations
 * of it is mechanical: a dictionary value using a word the glossary banned.
 * Two such violations shipped before this check existed, both in strings the
 * Standards review had already read.
 *
 * The scan is deliberately narrow, because a wide one would be noise:
 *
 * - It reads **only the Chinese dictionaries** (`ZH` / `zh`). The glossary
 *   defines Chinese vocabulary; the English dictionaries are its translations
 *   and their wording is decided by the host's own labels, which this plugin
 *   reproduces verbatim.
 * - It checks **only the terms marked `<!-- check:copy -->`** in the glossary.
 *   Most entries ban words for *writing about the code* ("条目", "节点" for a
 *   plugin row), where a different vocabulary applies than in a sentence a user
 *   reads. The marker says "this term's avoid-list also governs on-screen copy".
 * - Before matching, it removes every *declared* term name from the string, so
 *   an approved term that happens to contain a banned word ("图片附件") is not
 *   reported. Longest name first, so the removal is unambiguous.
 *
 * Run: `node scripts/check-glossary.mjs` (part of `pnpm run ci`).
 *
 * @module @leiwang2000/dsh-tweaks/scripts/check-glossary
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GLOSSARY = join(PACKAGE_ROOT, 'GLOSSARY.md')
const SRC_ROOT = join(PACKAGE_ROOT, 'src')

/** The marker that opts a term's avoid-list into the on-screen-copy check. */
const COPY_MARKER = '<!-- check:copy -->'

/** Collect assertion failures instead of throwing on the first. */
const failures = []
/** Collect successful assertions for the report. */
const passes = []

/**
 * Record one assertion.
 * @param label - what was checked.
 * @param condition - the outcome.
 * @param detail - evidence shown when the assertion fails.
 */
function check(label, condition, detail) {
  if (condition) {
    passes.push(label)
    return
  }
  failures.push(detail === undefined ? label : `${label}: ${detail}`)
}

/**
 * Parse the glossary into its terms.
 *
 * An entry is a bold head line `**术语（Term）**：`, then prose, then an
 * `_Avoid_:` line, then (optionally) the copy marker on the line after it.
 * @param source - the glossary's text.
 * @returns one record per entry that declares avoided words.
 */
function parseTerms(source) {
  const lines = source.split('\n')
  const terms = []
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith('**') || !line.trimEnd().endsWith('：'))
      continue
    const name = line.replace(/^\*\*/u, '').split('（')[0].trim()
    const avoidIndex = lines.findIndex((candidate, at) => at > index && candidate.startsWith('_Avoid_'))
    if (avoidIndex === -1)
      continue
    const avoided = lines[avoidIndex]
      .replace(/^_Avoid_:\s*/u, '')
      .split('、')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
    terms.push({
      name,
      avoided,
      /** Whether this entry's avoid-list governs on-screen copy too. */
      copyChecked: lines[avoidIndex + 1]?.trim() === COPY_MARKER,
    })
  }
  return terms
}

/**
 * Read the dictionary entries of one locale file's Chinese dictionary.
 *
 * Every dictionary is `export const ZH = { 'key': 'value', … }` or the lowercase
 * spelling; the English dictionary in the same file is skipped on purpose.
 * @param path - the locale file.
 * @returns the values, each with its line number.
 */
async function readCopyValues(path) {
  const source = await readFile(path, 'utf8')
  const lines = source.split('\n')
  const values = []
  let inChineseDictionary = false
  for (const [index, line] of lines.entries()) {
    if (/^export const (?:ZH|zh) = \{/u.test(line)) {
      inChineseDictionary = true
      continue
    }
    if (inChineseDictionary && /^\}/u.test(line)) {
      inChineseDictionary = false
      continue
    }
    if (!inChineseDictionary)
      continue
    const match = /^\s*'[^']+':\s*'(.*)',\s*$/u.exec(line)
    if (match !== null)
      values.push({ line: index + 1, value: match[1] })
  }
  return values
}

/**
 * Collect every locale file under the sources.
 * @param directory - the directory to walk.
 * @returns the file paths.
 */
async function collectLocaleFiles(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules')
      continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...await collectLocaleFiles(path))
      continue
    }
    if (entry.name === 'locales.ts')
      found.push(path)
  }
  return found
}

/**
 * Remove every declared term name from a string, longest name first.
 *
 * Without this, an approved term that contains a banned word would report
 * itself: "图片附件" is the correct term, and "图片" is what the same entry
 * says to avoid when the term is not meant.
 * @param value - the copy string.
 * @param termNames - every declared term name, in any order.
 * @returns the string with declared terms taken out.
 */
function withoutDeclaredTerms(value, termNames) {
  let result = value
  for (const name of [...termNames].sort((left, right) => right.length - left.length))
    result = result.split(name).join('')
  return result
}

/**
 * Report every copy value that uses a word the glossary avoids.
 *
 * One violation is one (file, line, term, word) tuple. Declared term names are
 * removed from the value first, so an approved term that contains a banned word
 * does not report itself.
 * @param copyTerms - the terms whose avoid-lists govern on-screen copy.
 * @param termNames - every declared term name, approved wording included.
 * @param localeFiles - the dictionaries to scan.
 */
async function reportViolations(copyTerms, termNames, localeFiles) {
  for (const file of localeFiles) {
    for (const { line, value } of await readCopyValues(file)) {
      const remaining = withoutDeclaredTerms(value, termNames)
      for (const term of copyTerms) {
        for (const avoided of term.avoided) {
          if (!remaining.includes(avoided))
            continue
          const where = `${relative(PACKAGE_ROOT, file)}:${line}`
          failures.push(`"${avoided}" is avoided for ${term.name}, but the copy uses it: ${where} ${value}`)
        }
      }
    }
  }
}

async function main() {
  const terms = parseTerms(await readFile(GLOSSARY, 'utf8'))
  const copyTerms = terms.filter(term => term.copyChecked)
  const termNames = terms.map(term => term.name)

  check('the glossary declares terms', terms.length > 0, GLOSSARY)
  check(
    'at least one term is marked for the copy check',
    copyTerms.length > 0,
    `no entry carries ${COPY_MARKER}`,
  )

  const localeFiles = await collectLocaleFiles(SRC_ROOT)
  check('at least one locale file was found', localeFiles.length > 0, SRC_ROOT)

  await reportViolations(copyTerms, termNames, localeFiles)

  const copyChecks = copyTerms.reduce((total, term) => total + term.avoided.length, 0)
  passes.push(`scanned ${localeFiles.length} locale file(s) for ${copyChecks} avoided word(s) in ${copyTerms.length} term(s)`)

  for (const label of passes) console.log(`  ok   ${label}`)
  for (const failure of failures) console.error(`  FAIL ${failure}`)

  if (failures.length > 0) {
    console.error(`\nglossary contract: ${failures.length} failure(s)`)
    process.exitCode = 1
    return
  }
  console.log('\nglossary contract: the on-screen copy uses the glossary\'s vocabulary')
}

await main()
