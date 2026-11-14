/**
 * Wizard-facing tolerant CSV/TXT parse: wraps engine parser.
 * Encoding is handled by csvEncoding before this is called.
 */

import {
  detectPayrollDelimiter,
  parsePayrollCsv,
  type PayrollParseResult,
} from '../engine'

export { detectPayrollDelimiter }

/**
 * Inspect the first non-empty line and pick delimiter.
 * Priority: TAB (`\t`) when present → `;` → `,`.
 */
export function detectDelimiterFromText(text: string): '\t' | ';' | ',' {
  const first =
    text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .find((l) => l.trim() !== '') ?? ''
  return detectPayrollDelimiter(first)
}

/**
 * Parse payroll CSV/TXT/paste after encoding normalization.
 * Supports TAB / `;` / `,`, BR numbers, legacy + native extractor columns
 * (delimiter detection implemented in `detectPayrollDelimiter` / `parsePayrollCsv`).
 */
export function parsePayrollTolerant(text: string): PayrollParseResult {
  // Normalize NBSP and odd Aptools line endings before engine parse.
  const cleaned = text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  return parsePayrollCsv(cleaned)
}
