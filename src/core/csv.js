/** Escape cells and prevent user-supplied text from becoming spreadsheet formulas. */
export function toCSV(rows) {
    return rows.map(row => row.map(value => {
        let text = String(value);
        if (typeof value === 'string' && /^\s*[=+@\-\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
}
