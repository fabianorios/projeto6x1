/**
 * Wizard-facing tolerant CSV parse: wraps engine parser.
 * Encoding is handled by csvEncoding before this is called.
 */

import {
  parsePayrollCsv,
  type PayrollParseResult,
} from '../engine'

/**
 * Parse payroll CSV/paste after encoding normalization.
 * Supports `;` / `,`, BR numbers, legacy + native extractor columns
 * (implemented in `parsePayrollCsv`).
 */
export function parsePayrollTolerant(text: string): PayrollParseResult {
  // Normalize NBSP and odd Aptools line endings before engine parse.
  const cleaned = text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  return parsePayrollCsv(cleaned)
}
