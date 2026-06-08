export function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function renderCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n') + '\n';
}
