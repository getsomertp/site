// Simple CSV download helper (client-side)
// - Escapes quotes
// - Preserves column order (if provided)
// - Works well with Excel/Sheets

type CsvValue = string | number | boolean | null | undefined | Date;

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  // If value contains special chars, wrap in quotes and escape quotes
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function toCsv(rows: Array<Record<string, CsvValue>>, columns?: string[]): string {
  const cols = columns && columns.length
    ? columns
    : Array.from(
        rows.reduce((set, r) => {
          Object.keys(r || {}).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()),
      );

  const header = cols.map(escapeCsvValue).join(",");
  const lines = rows.map((r) => cols.map((c) => escapeCsvValue((r as any)?.[c])).join(","));
  // BOM helps Excel recognize UTF-8
  return `\ufeff${header}\n${lines.join("\n")}`;
}

export function downloadCsv(filename: string, rows: Array<Record<string, CsvValue>>, columns?: string[]) {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
