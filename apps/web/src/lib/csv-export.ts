/**
 * Kumaran Chits — Client-Side CSV Export Utility
 * Generates RFC 4180 compliant CSV files with UTF-8 BOM for Microsoft Excel (Tamil Unicode)
 * and OWASP CSV/DDE Formula Injection neutralization.
 */

export type CsvCellValue = string | number | bigint | null | undefined;

export interface CsvExportOptions {
  filename: string;
  headers: string[];
  rows: CsvCellValue[][];
}

// Neutralize cells starting with =, +, -, @, \t, or \r — including after leading whitespace
const FORMULA_INJECTION_PATTERN = /^[\t\r]|^\s*[=+\-@]/;

/**
 * Sanitizes a download filename by stripping path traversal, control chars,
 * and unsafe filesystem characters while ensuring a `.csv` extension.
 */
export function sanitizeCsvFilename(filename: string, fallback = 'kumaran-chits-export'): string {
  const base = (filename ?? '')
    .replace(/[\r\n\t\0]/g, '')
    .replace(/(?:\.\.[\\/])+/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
    .trim();

  const safe = base || fallback;
  return safe.toLowerCase().endsWith('.csv') ? safe : `${safe}.csv`;
}

/**
 * Escapes a single CSV field value according to RFC 4180 standards and neutralizes
 * Excel/Calc formula injection payloads (=, +, -, @, \t, \r, including after leading whitespace).
 */
export function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (FORMULA_INJECTION_PATTERN.test(str)) {
    str = `'${str}`;
  }

  // If string contains comma, double quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes headers and rows into an RFC 4180 CSV string prefixed with UTF-8 BOM (\uFEFF)
 * so Microsoft Excel on Windows renders Tamil Unicode scripts accurately.
 */
export function serializeCsv(headers: string[], rows: CsvCellValue[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

function triggerCsvBlobDownload(csvWithBom: string, filename: string): void {
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.setAttribute('href', url);
    link.setAttribute('download', sanitizeCsvFilename(filename));
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
  } finally {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }
}

/**
 * Triggers a browser download of a CSV file (synchronous for small datasets).
 */
export function downloadCsv({ filename, headers, rows }: CsvExportOptions): void {
  if (typeof window === 'undefined') return;
  const csvWithBom = serializeCsv(headers, rows);
  triggerCsvBlobDownload(csvWithBom, filename);
}

/**
 * Triggers a browser download of a CSV file asynchronously in chunked batches (500 rows per slice),
 * yielding to the browser main thread event loop to prevent UI freezing on large datasets.
 */
export async function downloadCsvAsync({
  filename,
  headers,
  rows,
  chunkSize = 500,
}: CsvExportOptions & { chunkSize?: number }): Promise<void> {
  if (typeof window === 'undefined') return;

  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (const row of chunk) {
      rowLines.push(row.map(escapeCsvCell).join(','));
    }
    // Yield to the browser main thread macro-task queue if there are more chunks
    if (i + chunkSize < rows.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const csvWithBom = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  triggerCsvBlobDownload(csvWithBom, filename);
}
