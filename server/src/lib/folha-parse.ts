/**
 * Server-side Folha TXT/CSV decode + tolerant parse (Aptools P2).
 * Mirrors SPA csvEncoding + parsePayrollTolerant — no PII logging.
 */

import { parsePayrollCsv, type PayrollParseResult } from "./shared-engine.js";

export type FolhaEncoding = "utf-8" | "windows-1252";

const REPLACEMENT = "\uFFFD";
export const MAX_FOLHA_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB aggregated Folha

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function countReplacements(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (ch === REPLACEMENT) n++;
  }
  return n;
}

function scoreDecoded(text: string): number {
  const reps = countReplacements(text);
  const accents = (text.match(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/g) ?? []).length;
  return accents * 2 - reps * 10;
}

function decodeWith(label: FolhaEncoding, buffer: ArrayBuffer): string {
  return new TextDecoder(label, { fatal: false }).decode(buffer);
}

/** Decode Folha bytes: UTF-8 first, Windows-1252 if fewer mojibake. */
export function decodeFolhaBuffer(buffer: ArrayBuffer): {
  text: string;
  encoding: FolhaEncoding;
} {
  const utf8 = stripBom(decodeWith("utf-8", buffer));
  const win = stripBom(decodeWith("windows-1252", buffer));

  if (countReplacements(utf8) === 0) {
    return { text: utf8, encoding: "utf-8" };
  }

  const scoreUtf = scoreDecoded(utf8);
  const scoreWin = scoreDecoded(win);
  if (scoreWin > scoreUtf) {
    return { text: win, encoding: "windows-1252" };
  }
  return { text: utf8, encoding: "utf-8" };
}

/** Tolerant parse after encoding normalize (TAB / `;` / `,`). */
export function parseFolhaTolerant(text: string): PayrollParseResult {
  const cleaned = text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return parsePayrollCsv(cleaned);
}

export function decodeAndParseFolhaBytes(bytes: ArrayBuffer | Uint8Array): {
  result: PayrollParseResult;
  encoding: FolhaEncoding;
  charCount: number;
} {
  let buffer: ArrayBuffer;
  if (bytes instanceof ArrayBuffer) {
    buffer = bytes;
  } else {
    buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }
  const { text, encoding } = decodeFolhaBuffer(buffer);
  return {
    result: parseFolhaTolerant(text),
    encoding,
    charCount: text.length,
  };
}
