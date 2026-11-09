import type { BalanceMonth, Payment } from './types';
import { kassaFileName, kassaXlsx, otchyotFileName, otchyotXlsx } from './kassaBooks';
import { todayTashkent } from './format';

function save(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The daily report book ("otchyot"), laid out like the kassa's own file. */
export async function downloadOtchyotXlsx(from: string, to: string, payments: Payment[]) {
  save(otchyotXlsx(payments), otchyotFileName(from, to));
}

/** One kassa book: "kassa naxt" (1-kassa) or "kassa karta" (2-kassa). */
export async function downloadKassaBook(data: BalanceMonth, source: 'cash' | 'card', categoryLabel: (c: string) => string) {
  save(kassaXlsx(data, source, categoryLabel, todayTashkent()), kassaFileName(source, data.first, data.last));
}
