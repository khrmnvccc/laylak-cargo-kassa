import type { ExpenseCategory } from './types';

/** Expense categories, in the order the forms list them. */
export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'tovar', label: 'Tovar xaridi' },
  { value: 'paket', label: 'Paket va qadoq' },
  { value: 'yetkazish', label: 'Yetkazib berish' },
  { value: 'yoqilgi', label: 'Yoqilgʻi va transport' },
  { value: 'ijara', label: 'Ijara' },
  { value: 'oylik', label: 'Oylik va avans' },
  { value: 'kommunal', label: 'Kommunal va aloqa' },
  { value: 'inkassa', label: 'Inkassa (pul topshirildi)' },
  { value: 'tovar_olib_kelish', label: 'Tovar olib kelish' },
  { value: 'togamga', label: 'Togʻamga' },
  { value: 'arofat', label: 'Arofat akaga' },
  { value: 'boshqa', label: 'Boshqa' },
];
