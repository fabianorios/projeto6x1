/**
 * Tolerant CSV text decoding: UTF-8 (with BOM) or Windows-1252.
 */

export type CsvEncoding = 'utf-8' | 'windows-1252'

const REPLACEMENT = '\uFFFD'

function decodeWith(label: CsvEncoding, buffer: ArrayBuffer): string {
  return new TextDecoder(label, { fatal: false }).decode(buffer)
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '')
}

/** Count Unicode replacement characters (mojibake / decode failures). */
export function countReplacements(text: string): number {
  let n = 0
  for (const ch of text) {
    if (ch === REPLACEMENT) n++
  }
  return n
}

/**
 * Score decoded text for Portuguese payroll CSVs.
 * Prefer fewer replacements and presence of common accented letters.
 */
function scoreDecoded(text: string): number {
  const reps = countReplacements(text)
  const accents = (text.match(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/g) ?? []).length
  // Penalize replacements heavily; reward accents lightly.
  return accents * 2 - reps * 10
}

/**
 * Decode CSV bytes trying UTF-8 first, falling back to Windows-1252
 * when UTF-8 produces more mojibake (typical Aptools export from Windows).
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): {
  text: string
  encoding: CsvEncoding
} {
  const utf8 = stripBom(decodeWith('utf-8', buffer))
  const win = stripBom(decodeWith('windows-1252', buffer))

  if (countReplacements(utf8) === 0) {
    return { text: utf8, encoding: 'utf-8' }
  }

  const scoreUtf = scoreDecoded(utf8)
  const scoreWin = scoreDecoded(win)
  if (scoreWin > scoreUtf) {
    return { text: win, encoding: 'windows-1252' }
  }
  return { text: utf8, encoding: 'utf-8' }
}

/** Decode a browser File (ArrayBuffer) with encoding detection. */
export async function readCsvFileText(file: File): Promise<{
  text: string
  encoding: CsvEncoding
}> {
  const buffer = await file.arrayBuffer()
  return decodeCsvBuffer(buffer)
}
