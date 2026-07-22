/**
 * Minimal RFC 4180 CSV serialisation shared by every tool that offers a
 * "take this artifact home" CSV export (see docs/anthropic-directory-submission.md
 * §"portable artifacts"). Quotes a cell only when it contains a comma,
 * quote, or newline — the common convention that keeps simple numeric/ASCII
 * cells readable while still round-tripping correctly through Excel/Sheets.
 */

export function csvEscapeCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialise a header row plus data rows into a single CSV string (trailing newline included). */
export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [header.map((h) => csvEscapeCell(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => csvEscapeCell(cell === null ? "" : String(cell))).join(","));
  }
  return `${lines.join("\n")}\n`;
}
