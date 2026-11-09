import { zipSync, strToU8 } from 'fflate';

// A small .xlsx writer for the books that must look exactly like the kassa's hand-kept Excel files:
// font colours, number formats with "soʻm", formulas (with their values filled in, so phone viewers
// that never recalculate still show the sums), column widths, row heights and a frozen header row.
// Pure code: used both in the browser (download buttons) and on the server (Telegram report).

export interface XStyle {
  color?: string; // 'FF0000' (no #); none = the usual black text
  size?: number;
  bold?: boolean;
  format?: string; // number format code
  align?: 'center' | 'left' | 'right';
  wrap?: boolean;
}

export type XValue = number | string | { date: string } | { formula: string; value: number };
export interface XCell { v: XValue; s?: XStyle }
export interface XSheet {
  name: string;
  rows: Array<Array<XCell | null> | null>;
  widths?: number[];
  heights?: Record<number, number>; // 1-based row → points
  freezeRows?: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const colName = (i: number) => {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Excel's day number for a YYYY-MM-DD date. */
export const excelDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};

export function buildXlsx(sheets: XSheet[]): Uint8Array {
  const fonts: string[] = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><charset val="204"/><scheme val="minor"/></font>'];
  const numFmts: string[] = [];
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const xfIndex = new Map<string, number>([['{}', 0]]);
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();

  const fontId = (s: XStyle) => {
    if (!s.color && !s.bold && (!s.size || s.size === 11)) return 0;
    const xml = `<font>${s.bold ? '<b/>' : ''}<sz val="${s.size || 11}"/>${s.color ? `<color rgb="FF${s.color.toUpperCase()}"/>` : '<color theme="1"/>'}<name val="Calibri"/><family val="2"/><charset val="204"/><scheme val="minor"/></font>`;
    const i = fonts.indexOf(xml);
    return i >= 0 ? i : fonts.push(xml) - 1;
  };
  const fmtId = (code?: string) => {
    if (!code) return 0;
    if (code === 'General') return 0;
    const i = numFmts.indexOf(code);
    return 164 + (i >= 0 ? i : numFmts.push(code) - 1);
  };
  const styleId = (s?: XStyle) => {
    const key = JSON.stringify(s || {});
    const known = xfIndex.get(key);
    if (known !== undefined) return known;
    const f = fontId(s || {}), n = fmtId(s?.format);
    const align = s?.align || s?.wrap ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xml = `<xf numFmtId="${n}" fontId="${f}" fillId="0" borderId="0" xfId="0"${n ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${align ? ` applyAlignment="1">${align}</xf>` : '/>'}`;
    const id = xfs.push(xml) - 1;
    xfIndex.set(key, id);
    return id;
  };
  const sst = (text: string) => {
    let i = stringIndex.get(text);
    if (i === undefined) { i = strings.push(text) - 1; stringIndex.set(text, i); }
    return i;
  };

  const sheetXml = (sheet: XSheet) => {
    const rows = sheet.rows.map((row, r) => {
      const height = sheet.heights?.[r + 1];
      const cells = (row || []).map((cell, c) => {
        if (!cell) return '';
        const ref = `${colName(c)}${r + 1}`;
        const s = styleId(cell.s);
        const sAttr = s ? ` s="${s}"` : '';
        const v = cell.v;
        if (typeof v === 'number') return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
        if (typeof v === 'string') return `<c r="${ref}"${sAttr} t="s"><v>${sst(v)}</v></c>`;
        if ('date' in v) return `<c r="${ref}"${sAttr}><v>${excelDate(v.date)}</v></c>`;
        return `<c r="${ref}"${sAttr}><f>${esc(v.formula.replace(/^=/, ''))}</f><v>${v.value}</v></c>`;
      }).join('');
      if (!cells && !height) return '';
      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
    }).join('');
    const freeze = sheet.freezeRows
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const cols = sheet.widths?.length
      ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  };

  const sheetFiles = sheets.map(sheetXml); // fills the style and string tables
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    'xl/sharedStrings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`),
  };
  sheetFiles.forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml); });
  return zipSync(files, { level: 6 });
}
