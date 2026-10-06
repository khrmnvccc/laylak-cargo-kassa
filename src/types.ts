export interface ReportRecord {
  id: string;
  date: string; // YYYY-MM-DD
  idNumber: string; // e.g. "101111"
  tripsCount: number; // Reyslar soni
  cash: number; // Naqd
  card: number; // Karta
  yandex: number; // Yandex
  pochta: number; // Pochta
  total: number; // Umumiy kassa (Naqd + Karta + Yandex + Pochta)
  period10Days?: string; // 1-10 kun, 11-20 kun, 21-31 kun
  note?: string;
  createdBy?: string; // e.g. "asliddin"
  createdByName?: string; // e.g. "Asliddin Nurdinov"
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CashRecord {
  id: string;
  date: string; // YYYY-MM-DD
  startingBalance: number; // Bor bo'lgan summa (oldingi kun qoldig'i)
  income: number; // Tushgan summa
  expense: number; // Ishlatilgan summa
  balance: number; // Qolgan summa (startingBalance + income - expense)
  category?: ExpenseCategory;
  note: string; // Izoh (masalan: "210 000 tovarga")
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ExpenseCategory =
  | 'tovar'
  | 'paket'
  | 'registrator'
  | 'otkazma'
  | 'yoqilgi'
  | 'ijara'
  | 'boshqa';

export interface ExpenseRecord {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  note: string;
  sourceKassaId?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO date
  actionType:
    | 'report_add'
    | 'report_edit'
    | 'report_delete'
    | 'kassa_add'
    | 'kassa_edit'
    | 'kassa_delete'
    | 'expense_add'
    | 'expense_delete'
    | 'user_login'
    | 'user_add';
  title: string;
  description: string;
  authorUsername: string;
  authorName: string;
  authorRole: 'admin' | 'kassir';
}

export interface DailyCashCardSummary {
  date: string;
  cash: number;
  card: number;
  total: number;
  tripsCount: number;
  sourceReportsCount: number;
}

export interface DecadeSummary {
  decadeKey: string; // e.g. "2026-09-D1"
  periodLabel: string; // e.g. "01 - 10 Sentabr"
  month: string; // e.g. "2026-09"
  decadeIndex: 1 | 2 | 3;
  tripsCount: number;
  cash: number;
  card: number;
  yandex: number;
  pochta: number;
  total: number;
  recordsCount: number;
}

export interface MonthlySummary {
  monthKey: string; // e.g. "2026-09"
  monthName: string; // e.g. "Sentabr 2026"
  tripsCount: number;
  cash: number;
  card: number;
  yandex: number;
  pochta: number;
  totalRevenue: number;
  kassaIncome: number;
  kassaExpense: number;
  kassaFinalBalance: number;
  reportsCount: number;
}

export interface UserSession {
  username: string;
  name: string;
  role: 'admin' | 'kassir';
  isLoggedIn: boolean;
  loginTime: string;
}

export type DateFilterType =
  | 'today'
  | 'yesterday'
  | '7days'
  | '10days'
  | 'thisMonth'
  | 'all'
  | 'custom';

export type ActiveTab =
  | 'dashboard'
  | 'kassa'
  | 'reports'
  | 'cashCard'
  | 'expenses'
  | 'decade'
  | 'monthly'
  | 'search'
  | 'auditLog'
  | 'settings';
