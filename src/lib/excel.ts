import type { BalanceMonth, Payment } from './types';
import { XLSX_OPTIONS, kassaSheets, monthSheets } from './excelSheets';

export async function downloadKassaXlsx(fileName: string, payments: Payment[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(kassaSheets(payments), XLSX_OPTIONS).toFile(fileName);
}

export async function downloadMonthXlsx(data: BalanceMonth, categoryLabel: (c: string) => string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(monthSheets(data, categoryLabel), XLSX_OPTIONS).toFile(`kassa_${data.first}_${data.last}.xlsx`);
}
