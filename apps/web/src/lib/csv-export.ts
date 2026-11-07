/**
 * Kumaran Chits — Client-Side CSV Export Utility
 * Generates RFC 4180 compliant CSV files with UTF-8 BOM for Microsoft Excel compatibility.
 */

export interface CsvExportOptions {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

/**
 * Escapes a single CSV field value according to RFC 4180 standards.
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If string contains comma, double quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Triggers a browser download of a CSV file (synchronous for small datasets).
 */
export function downloadCsv({ filename, headers, rows }: CsvExportOptions): void {
  if (typeof window === 'undefined') return;

  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  const csvContent = [headerLine, ...rowLines].join('\r\n');

  // Prefix with UTF-8 BOM (\uFEFF) so Excel on Windows detects UTF-8 correctly (Tamil scripts)
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
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

  const csvContent = [headerLine, ...rowLines].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
