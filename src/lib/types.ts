export type Role = 'admin' | 'worker';
export type Method = 'cash' | 'card' | 'yandex' | 'pochta';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
}

export interface Payment {
  id: string;
  client_code: string;
  client_name: string | null;
  amount: number;
  method: Method;
  note: string | null;
  paid_at: string;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  is_legacy: boolean;
  client_phone?: string | null;
}

export interface Totals {
  total: number;
  cash: number;
  card: number;
  yandex: number;
  pochta: number;
  count: number;
  clients?: number;
}

export interface DayRow extends Totals {
  day: string;
}

export interface WorkerRow extends Totals {
  id: string;
  name: string;
}

export interface Summary {
  from: string;
  to: string;
  previousRange: { from: string; to: string };
  totals: Totals;
  previous: Totals;
  byWorker: WorkerRow[];
  byDay: DayRow[];
  recent: Payment[];
}

export interface PaymentList extends Totals {
  from: string;
  to: string;
  items: Payment[];
  limit: number;
  offset: number;
}

export interface PeriodRow extends Totals {
  period: string;
  clients: number;
  active_days: number;
}

export interface Staff extends Totals {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ClientRow {
  code: string;
  full_name: string | null;
  phone: string | null;
  total: number;
  cash: number;
  /** Card, Yandex and Pochta together. */
  card: number;
  online: number;
  count: number;
  last_paid_at: string | null;
}

export interface ClientList {
  items: ClientRow[];
  sort: 'active' | 'most' | 'least' | 'recent';
  limit: number;
  offset: number;
  clients: number;
  active30: number;
  total: number;
  cash: number;
  card: number;
}

export type Source = Method;
export type ExpenseCategory = 'tovar' | 'paket' | 'yetkazish' | 'yoqilgi' | 'ijara' | 'oylik' | 'kommunal' | 'inkassa' | 'boshqa';

export interface SourceBalance {
  source: 'cash' | 'card';
  opening: number;
  income: number;
  income_yandex: number;
  income_pochta: number;
  expense: number;
  adjustment: number;
  closing: number;
  current: number;
}

export interface Expense {
  id: string;
  amount: number;
  source: 'cash' | 'card';
  category: ExpenseCategory;
  note: string | null;
  spent_at: string;
  created_by_name: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface Adjustment {
  id: string;
  source: Source;
  amount: number;
  note: string;
  at: string;
  created_by_name: string;
}

export interface BalanceReport {
  date: string;
  sources: SourceBalance[];
  expenses: Expense[];
  adjustments: Adjustment[];
  recent: Array<{ day: string; income: number; expense: number; cash_expense: number; card_expense: number }>;
}
