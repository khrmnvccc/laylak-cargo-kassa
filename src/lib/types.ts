export type Role = 'admin' | 'worker';
export type Method = 'cash' | 'card';

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
}

export interface Totals {
  total: number;
  cash: number;
  card: number;
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
  count: number;
  last_paid_at: string | null;
}
