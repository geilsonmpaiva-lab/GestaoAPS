export function safeSpreadsheetValue(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) => `"${String(safeSpreadsheetValue(value)).replaceAll('"', '""')}"`;
  return `\uFEFF${columns.map(escape).join(",")}\r\n${rows.map((row) => columns.map((column) => escape(row[column])).join(",")).join("\r\n")}`;
}
