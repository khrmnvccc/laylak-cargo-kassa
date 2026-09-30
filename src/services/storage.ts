import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  ExpenseCategory,
  UserSession,
  UserAccount,
  ActivityLog,
} from '../types';
import { getDecadeInfo } from '../utils/formatters';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const STORAGE_KEYS = {
  REPORTS: 'cargogo_reports_v2',
  KASSA: 'cargogo_kassa_v2',
  EXPENSES: 'cargogo_expenses_v2',
  USER: 'cargogo_user_v2',
  SETTINGS: 'cargogo_settings_v2',
  ACCOUNTS: 'cargogo_accounts_v3',
  LOGS: 'cargogo_logs_v2',
  THEME: 'cargogo_theme_v2',
};

export const INITIAL_ACCOUNTS: UserAccount[] = [
  {
    id: 'acc-admin-1',
    username: 'asliddin',
    name: 'Asliddin Nurdinov',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'acc-admin-2',
    username: 'admin',
    name: 'Bosh Administrator',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
  },
];

// Initial realistic seed data matching user prompt specifications
const INITIAL_REPORTS: ReportRecord[] = [
  {
    id: 'rep-1',
    date: '2026-09-02',
    idNumber: '101111',
    tripsCount: 14,
    cash: 95000,
    card: 2590000,
    yandex: 150000,
    pochta: 50000,
    total: 2885000,
    period10Days: '1 - 10 kun (1-dekada)',
    note: 'Markaziy zona reyslari',
    createdAt: '2026-09-02T18:30:00Z',
  },
  {
    id: 'rep-2',
    date: '2026-09-02',
    idNumber: '102222',
    tripsCount: 8,
    cash: 120000,
    card: 850000,
    yandex: 0,
    pochta: 0,
    total: 970000,
    period10Days: '1 - 10 kun (1-dekada)',
    note: 'Chilonzor yoʻnalishi',
    createdAt: '2026-09-02T19:00:00Z',
  },
  {
    id: 'rep-3',
    date: '2026-09-03',
    idNumber: '101111',
    tripsCount: 16,
    cash: 140000,
    card: 1820000,
    yandex: 210000,
    pochta: 80000,
    total: 2250000,
    period10Days: '1 - 10 kun (1-dekada)',
    note: 'Shahar boʻylab yetkazib berish',
    createdAt: '2026-09-03T18:45:00Z',
  },
  {
    id: 'rep-4',
    date: '2026-09-04',
    idNumber: '103333',
    tripsCount: 11,
    cash: 80000,
    card: 1150000,
    yandex: 120000,
    pochta: 0,
    total: 1350000,
    period10Days: '1 - 10 kun (1-dekada)',
    note: 'Yunusobod hududi',
    createdAt: '2026-09-04T17:30:00Z',
  },
  {
    id: 'rep-5',
    date: '2026-09-12',
    idNumber: '101111',
    tripsCount: 19,
    cash: 180000,
    card: 3100000,
    yandex: 190000,
    pochta: 110000,
    total: 3580000,
    period10Days: '11 - 20 kun (2-dekada)',
    note: 'Ekspress buyurtmalar',
    createdAt: '2026-09-12T19:10:00Z',
  },
  {
    id: 'rep-6',
    date: '2026-09-15',
    idNumber: '104444',
    tripsCount: 15,
    cash: 110000,
    card: 1950000,
    yandex: 95000,
    pochta: 40000,
    total: 2195000,
    period10Days: '11 - 20 kun (2-dekada)',
    note: 'Sergeli tarmogʻi',
    createdAt: '2026-09-15T18:20:00Z',
  },
  {
    id: 'rep-7',
    date: '2026-09-22',
    idNumber: '101111',
    tripsCount: 22,
    cash: 210000,
    card: 3450000,
    yandex: 250000,
    pochta: 130000,
    total: 4040000,
    period10Days: '21 - 31 kun (3-dekada)',
    note: 'Yirik mijozlar buyurtmasi',
    createdAt: '2026-09-22T20:00:00Z',
  },
  {
    id: 'rep-8',
    date: '2026-09-29',
    idNumber: '101111',
    tripsCount: 17,
    cash: 102000,
    card: 917400,
    yandex: 180000,
    pochta: 60000,
    total: 1259400,
    period10Days: '21 - 31 kun (3-dekada)',
    note: 'Bugungi qabul qilingan reyslar',
    createdAt: '2026-09-29T14:30:00Z',
  },
];

// Initial realistic kassa records based on prompt's exact example:
// 02.09: Bor=0, Tushgan=149 400, Ishlatilgan=210 000, Qolgan=-60 600 ("210 000 tovarga")
// 03.09: Bor=-60 600, Tushgan=174 800, Ishlatilgan=0, Qolgan=114 200
// 04.09: Bor=114 200, Tushgan=108 000, Ishlatilgan=200 000, Qolgan=22 200
// Plus subsequent days leading to prompt's current snapshot (Kassa: 916 600, Bugungi tushum: 505 000, Bugungi xarajat: 0)
const INITIAL_KASSA: CashRecord[] = [
  {
    id: 'kas-1',
    date: '2026-09-02',
    startingBalance: 0,
    income: 149400,
    expense: 210000,
    balance: -60600,
    category: 'tovar',
    note: '210 000 tovarga',
    createdAt: '2026-09-02T19:00:00Z',
  },
  {
    id: 'kas-2',
    date: '2026-09-03',
    startingBalance: -60600,
    income: 174800,
    expense: 0,
    balance: 114200,
    note: 'Kunlik tushum',
    createdAt: '2026-09-03T19:00:00Z',
  },
  {
    id: 'kas-3',
    date: '2026-09-04',
    startingBalance: 114200,
    income: 108000,
    expense: 200000,
    balance: 22200,
    category: 'tovar',
    note: '200 000 tovar toʻlovi',
    createdAt: '2026-09-04T19:00:00Z',
  },
  {
    id: 'kas-4',
    date: '2026-09-05',
    startingBalance: 22200,
    income: 245000,
    expense: 71000,
    balance: 196200,
    category: 'paket',
    note: '71 000 paketga',
    createdAt: '2026-09-05T18:00:00Z',
  },
  {
    id: 'kas-5',
    date: '2026-09-10',
    startingBalance: 196200,
    income: 320000,
    expense: 30000,
    balance: 486200,
    category: 'registrator',
    note: '30 000 video registrator',
    createdAt: '2026-09-10T19:30:00Z',
  },
  {
    id: 'kas-6',
    date: '2026-09-18',
    startingBalance: 486200,
    income: 410000,
    expense: 5000,
    balance: 891200,
    category: 'otkazma',
    note: '5 000 kartaga tashlandi / naqd berildi',
    createdAt: '2026-09-18T17:15:00Z',
  },
  {
    id: 'kas-7',
    date: '2026-09-28',
    startingBalance: 891200,
    income: 380400,
    expense: 860000,
    balance: 411600,
    category: 'ijara',
    note: '860 000 ombor ijarasi',
    createdAt: '2026-09-28T19:00:00Z',
  },
  {
    id: 'kas-8',
    date: '2026-09-29',
    startingBalance: 411600,
    income: 505000,
    expense: 0,
    balance: 916600,
    note: 'Bugungi tushum kassa qoldigʻiga qoʻshildi',
    createdAt: '2026-09-29T14:00:00Z',
  },
];

// Helper to deduce expense category from note text
export function deduceExpenseCategory(note: string): ExpenseCategory {
  const n = (note || '').toLowerCase();
  if (n.includes('tovar') || n.includes('tavar') || n.includes('mahsulot')) return 'tovar';
  if (n.includes('paket') || n.includes('meshok') || n.includes('quti') || n.includes('skotch')) return 'paket';
  if (n.includes('registrator') || n.includes('video') || n.includes('telefon') || n.includes('texnika')) return 'registrator';
  if (n.includes('karta') || n.includes('otkazma') || n.includes('o\'tkazma') || n.includes('berildi') || n.includes('tashlandi')) return 'otkazma';
  if (n.includes('benzin') || n.includes('gaz') || n.includes('yoqilgi') || n.includes('yoqilg\'i') || n.includes('dizel') || n.includes('moy')) return 'yoqilgi';
  if (n.includes('ijara') || n.includes('arenda') || n.includes('svet') || n.includes('kommunal')) return 'ijara';
  return 'boshqa';
}

class StorageService {
  private reports: ReportRecord[] = [];
  private kassa: CashRecord[] = [];
  private expenses: ExpenseRecord[] = [];
  private accounts: UserAccount[] = [];
  private logs: ActivityLog[] = [];
  private user: UserSession = {
    username: '',
    name: '',
    role: 'admin',
    isLoggedIn: false,
    loginTime: '',
  };

  private listeners: Set<() => void> = new Set();
  private syncTimeout: any = null;
  private isSyncing = false;
  private lastServerTimestamp: string = '';
  public isServerConnected = false;

  constructor() {
    this.init();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('Storage listener error:', e);
      }
    });
  }

  private init() {
    try {
      const storedReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (storedReports) {
        this.reports = JSON.parse(storedReports);
      } else {
        this.reports = [...INITIAL_REPORTS];
        this.saveReports();
      }

      const storedKassa = localStorage.getItem(STORAGE_KEYS.KASSA);
      if (storedKassa) {
        this.kassa = JSON.parse(storedKassa);
      } else {
        this.kassa = [...INITIAL_KASSA];
        this.recalculateKassaChain();
        this.saveKassa();
      }

      const storedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      if (storedExpenses) {
        this.expenses = JSON.parse(storedExpenses);
      } else {
        this.syncExpensesFromKassa();
      }

      const storedAccounts = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (storedAccounts) {
        try {
          const parsed = JSON.parse(storedAccounts);
          this.accounts = Array.isArray(parsed) && parsed.length > 0 ? parsed : [...INITIAL_ACCOUNTS];
        } catch {
          this.accounts = [...INITIAL_ACCOUNTS];
        }
      } else {
        this.accounts = [...INITIAL_ACCOUNTS];
        this.saveAccountsOnly();
      }
      this.initFirestoreSync();

      const storedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (storedLogs) {
        this.logs = JSON.parse(storedLogs);
      } else {
        this.logs = [
          {
            id: 'log-init-1',
            timestamp: '2026-09-29T14:00:00Z',
            actionType: 'kassa_add',
            title: 'Kassaga tushum kiritildi',
            description: '2026-09-29 sanasiga 505 000 soʻm kunlik tushum kassa balansiga qoʻshildi',
            authorUsername: 'asliddin',
            authorName: 'Asliddin Nurdinov',
            authorRole: 'admin',
          },
          {
            id: 'log-init-2',
            timestamp: '2026-09-28T19:00:00Z',
            actionType: 'expense_add',
            title: 'Chiqim qayd etildi',
            description: '860 000 soʻm ombor ijarasi uchun chiqim qilindi',
            authorUsername: 'asliddin',
            authorName: 'Asliddin Nurdinov',
            authorRole: 'admin',
          },
          {
            id: 'log-init-3',
            timestamp: '2026-09-18T17:15:00Z',
            actionType: 'report_add',
            title: 'Reys otchyoti kiritildi',
            description: 'ID: 104444 raqamli 2 195 000 soʻmlik otchyot saqlandi',
            authorUsername: 'asliddin',
            authorName: 'Asliddin Nurdinov',
            authorRole: 'admin',
          },
        ];
        this.saveLogs();
      }

      const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
      if (storedUser) {
        this.user = JSON.parse(storedUser);
      } else {
        this.user = {
          username: '',
          name: '',
          role: 'admin',
          isLoggedIn: false,
          loginTime: '',
        };
        this.saveUser();
      }

      // If there are no accounts registered yet, ensure login screen opens for registration
      if (this.accounts.length === 0) {
        this.user.isLoggedIn = false;
      }

      // Start automatic background synchronization for cross-device updates
      if (typeof window !== 'undefined') {
        this.fetchServerData();
        setInterval(() => {
          this.fetchServerData();
        }, 3500);

        window.addEventListener('focus', () => {
          this.fetchServerData();
        });

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            this.fetchServerData();
          }
        });
      }
    } catch (e) {
      console.error('Storage initialization error:', e);
      this.reports = [...INITIAL_REPORTS];
      this.kassa = [...INITIAL_KASSA];
    }
  }

  // --- KASSA RE-CALCULATION CHAIN (Crucial Requirement) ---
  // "Keyingi kunning “Bor bo‘lgan summasi” avtomatik ravishda oldingi kunning “Qolgan summasi”dan olinsin.
  // Qolgan summa = Bor bo‘lgan summa + Tushgan summa - Ishlatilgan summa"
  public recalculateKassaChain(): void {
    if (this.kassa.length === 0) return;

    // Sort chronologically
    this.kassa.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentBalance = this.kassa[0].startingBalance || 0;

    for (let i = 0; i < this.kassa.length; i++) {
      const item = this.kassa[i];
      if (i > 0) {
        item.startingBalance = currentBalance;
      }
      const inc = Number(item.income) || 0;
      const exp = Number(item.expense) || 0;
      item.balance = item.startingBalance + inc - exp;
      currentBalance = item.balance;
    }
  }

  // Sync expenses from kassa records that have expense > 0
  private syncExpensesFromKassa(): void {
    const list: ExpenseRecord[] = [];
    this.kassa.forEach((k) => {
      if (k.expense > 0) {
        const cat = k.category || deduceExpenseCategory(k.note);
        list.push({
          id: `exp-${k.id}`,
          date: k.date,
          amount: k.expense,
          category: cat,
          note: k.note || 'Xarajat',
          sourceKassaId: k.id,
          createdAt: k.createdAt || new Date().toISOString(),
        });
      }
    });
    this.expenses = list;
    this.saveExpenses();
  }

  private initFirestoreSync(): void {
    if (typeof window === 'undefined') return;
    try {
      const docRef = doc(db, 'app_data', 'main');
      onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          this.isServerConnected = true;
          let hasChanges = false;

          if (Array.isArray(data.reports) && data.reports.length > 0 && JSON.stringify(this.reports) !== JSON.stringify(data.reports)) {
            this.reports = data.reports;
            this.saveReportsOnly();
            hasChanges = true;
          }

          if (Array.isArray(data.kassa) && data.kassa.length > 0 && JSON.stringify(this.kassa) !== JSON.stringify(data.kassa)) {
            this.kassa = data.kassa;
            this.saveKassaOnly();
            hasChanges = true;
          }

          if (Array.isArray(data.expenses) && JSON.stringify(this.expenses) !== JSON.stringify(data.expenses)) {
            this.expenses = data.expenses;
            this.saveExpensesOnly();
            hasChanges = true;
          }

          if (Array.isArray(data.accounts) && data.accounts.length > 0 && JSON.stringify(this.accounts) !== JSON.stringify(data.accounts)) {
            this.accounts = data.accounts;
            this.saveAccountsOnly();
            hasChanges = true;
          }

          if (Array.isArray(data.logs) && JSON.stringify(this.logs) !== JSON.stringify(data.logs)) {
            this.logs = data.logs;
            this.saveLogsOnly();
            hasChanges = true;
          }

          if (hasChanges) {
            this.notifyListeners();
          }
        } else {
          this.syncToFirestore();
        }
      }, (err) => {
        console.warn('Firestore snapshot notice:', err);
      });
    } catch (e) {
      console.warn('Firestore init notice:', e);
    }
  }

  public async syncToFirestore(): Promise<boolean> {
    try {
      const docRef = doc(db, 'app_data', 'main');
      const payload = {
        reports: this.reports,
        kassa: this.kassa,
        expenses: this.expenses,
        accounts: this.accounts,
        logs: this.logs,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(docRef, payload, { merge: true });
      this.isServerConnected = true;
      return true;
    } catch (err) {
      console.warn('Firestore sync write notice:', err);
      return false;
    }
  }

  // --- SAVE METHODS (LOCAL + SERVER SYNC) ---
  public triggerSync(): void {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncToFirestore();
      this.syncToServer();
    }, 250);
  }

  public async syncToServer(): Promise<boolean> {
    try {
      const payload = {
        reports: this.reports,
        kassa: this.kassa,
        expenses: this.expenses,
        accounts: this.accounts,
        logs: this.logs,
      };
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.updatedAt) {
          this.lastServerTimestamp = json.updatedAt;
        }
        this.isServerConnected = true;
        return true;
      }
      return false;
    } catch {
      this.isServerConnected = false;
      return false;
    }
  }

  public async fetchServerData(): Promise<boolean> {
    if (this.isSyncing) return false;
    try {
      this.isSyncing = true;
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) {
        this.isServerConnected = false;
        return false;
      }
      const json = await res.json();
      if (!json.success) {
        this.isServerConnected = false;
        return false;
      }

      this.isServerConnected = true;
      const serverUpdated = json.updatedAt;
      const serverReports = Array.isArray(json.reports) ? json.reports : [];
      const serverKassa = Array.isArray(json.kassa) ? json.kassa : [];
      const serverExpenses = Array.isArray(json.expenses) ? json.expenses : [];
      const serverAccounts = Array.isArray(json.accounts) ? json.accounts : [];
      const serverLogs = Array.isArray(json.logs) ? json.logs : [];

      // If server is completely empty (first boot), push initial local seed data to server
      if (
        serverReports.length === 0 &&
        serverKassa.length === 0 &&
        (this.reports.length > 0 || this.kassa.length > 0)
      ) {
        await this.syncToServer();
        return true;
      }

      // Check if server data differs or is newer
      let hasChanges = false;
      if (serverUpdated !== this.lastServerTimestamp) {
        if (serverReports.length > 0 && JSON.stringify(this.reports) !== JSON.stringify(serverReports)) {
          this.reports = serverReports;
          this.saveReportsOnly();
          hasChanges = true;
        }

        if (serverKassa.length > 0 && JSON.stringify(this.kassa) !== JSON.stringify(serverKassa)) {
          this.kassa = serverKassa;
          this.saveKassaOnly();
          hasChanges = true;
        }

        if (serverExpenses.length > 0 && JSON.stringify(this.expenses) !== JSON.stringify(serverExpenses)) {
          this.expenses = serverExpenses;
          this.saveExpensesOnly();
          hasChanges = true;
        }

        if (serverAccounts.length > 0 && JSON.stringify(this.accounts) !== JSON.stringify(serverAccounts)) {
          this.accounts = serverAccounts;
          this.saveAccountsOnly();
          hasChanges = true;
        }

        if (serverLogs.length > 0 && JSON.stringify(this.logs) !== JSON.stringify(serverLogs)) {
          this.logs = serverLogs;
          this.saveLogsOnly();
          hasChanges = true;
        }

        this.lastServerTimestamp = serverUpdated;

        if (hasChanges) {
          this.notifyListeners();
        }
      }
      return true;
    } catch {
      this.isServerConnected = false;
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  private saveReportsOnly(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(this.reports));
    } catch (err) {
      console.warn('Failed saving reports to localStorage', err);
    }
  }

  private saveKassaOnly(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.KASSA, JSON.stringify(this.kassa));
    } catch (err) {
      console.warn('Failed saving kassa to localStorage', err);
    }
  }

  private saveExpensesOnly(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(this.expenses));
    } catch (err) {
      console.warn('Failed saving expenses to localStorage', err);
    }
  }

  private saveAccountsOnly(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(this.accounts));
    } catch (err) {
      console.warn('Failed saving accounts to localStorage', err);
    }
  }

  private saveLogsOnly(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    } catch (err) {
      console.warn('Failed saving logs to localStorage', err);
    }
  }

  private saveReports(): void {
    this.saveReportsOnly();
    this.triggerSync();
    this.notifyListeners();
  }

  private saveKassa(): void {
    this.saveKassaOnly();
    this.triggerSync();
    this.notifyListeners();
  }

  private saveExpenses(): void {
    this.saveExpensesOnly();
    this.triggerSync();
    this.notifyListeners();
  }

  public saveUser(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(this.user));
      this.notifyListeners();
    } catch (err) {
      console.warn('Failed saving user to localStorage', err);
    }
  }

  public saveAccounts(): void {
    this.saveAccountsOnly();
    this.triggerSync();
    this.notifyListeners();
  }

  public saveLogs(): void {
    this.saveLogsOnly();
    this.triggerSync();
    this.notifyListeners();
  }

  public logAction(
    actionType: ActivityLog['actionType'],
    title: string,
    description: string,
    customAuthor?: { username: string; name: string; role: 'admin' | 'kassir' }
  ): void {
    const author = customAuthor || {
      username: this.user.username || 'admin',
      name: this.user.name || 'Bosh Administrator',
      role: this.user.role || 'admin',
    };

    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actionType,
      title,
      description,
      authorUsername: author.username,
      authorName: author.name,
      authorRole: author.role,
    };

    this.logs.unshift(newLog);
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(0, 500);
    }
    this.saveLogs();
  }

  public getLogs(): ActivityLog[] {
    return [...this.logs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public clearLogs(): void {
    this.logs = [];
    this.saveLogs();
  }

  // --- REPORTS CRUD ---
  public getReports(): ReportRecord[] {
    return [...this.reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public addReport(data: Omit<ReportRecord, 'id' | 'total' | 'period10Days' | 'createdAt'>): ReportRecord {
    const cash = Math.max(0, Number(data.cash) || 0);
    const card = Math.max(0, Number(data.card) || 0);
    const yandex = Math.max(0, Number(data.yandex) || 0);
    const pochta = Math.max(0, Number(data.pochta) || 0);
    const total = cash + card + yandex + pochta;
    const decadeInfo = getDecadeInfo(data.date);

    const newReport: ReportRecord = {
      id: `rep-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: data.date,
      idNumber: (data.idNumber || '').trim(),
      tripsCount: Math.max(0, Number(data.tripsCount) || 0),
      cash,
      card,
      yandex,
      pochta,
      total,
      period10Days: decadeInfo.label,
      note: data.note || '',
      createdBy: this.user.username || 'admin',
      createdByName: this.user.name || 'Bosh Administrator',
      createdAt: new Date().toISOString(),
    };

    this.reports.unshift(newReport);
    this.saveReports();

    // Log action
    this.logAction(
      'report_add',
      'Yangi otchyot qoʻshildi',
      `Sana: ${data.date} | ID: ${newReport.idNumber} | Summa: ${total.toLocaleString('uz-UZ')} soʻm (Reys: ${newReport.tripsCount} ta)`
    );

    return newReport;
  }

  public updateReport(id: string, data: Partial<ReportRecord>): ReportRecord | null {
    const idx = this.reports.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    const existing = this.reports[idx];
    const cash = data.cash !== undefined ? Math.max(0, Number(data.cash)) : existing.cash;
    const card = data.card !== undefined ? Math.max(0, Number(data.card)) : existing.card;
    const yandex = data.yandex !== undefined ? Math.max(0, Number(data.yandex)) : existing.yandex;
    const pochta = data.pochta !== undefined ? Math.max(0, Number(data.pochta)) : existing.pochta;
    const total = cash + card + yandex + pochta;
    const date = data.date || existing.date;
    const decadeInfo = getDecadeInfo(date);

    this.reports[idx] = {
      ...existing,
      ...data,
      date,
      cash,
      card,
      yandex,
      pochta,
      total,
      period10Days: decadeInfo.label,
      updatedBy: this.user.username || 'admin',
    };

    this.saveReports();

    // Log action
    this.logAction(
      'report_edit',
      'Otchyot tahrirlandi',
      `Sana: ${date} | ID: ${existing.idNumber} | Yangilangan summa: ${total.toLocaleString('uz-UZ')} soʻm`
    );

    return this.reports[idx];
  }

  public deleteReport(id: string): boolean {
    const target = this.reports.find((r) => r.id === id);
    if (!target) return false;

    this.reports = this.reports.filter((r) => r.id !== id);
    this.saveReports();

    // Log action
    this.logAction(
      'report_delete',
      'Otchyot oʻchirildi',
      `Sana: ${target.date} | ID: ${target.idNumber} | Summa: ${target.total.toLocaleString('uz-UZ')} soʻm`
    );

    return true;
  }

  // --- KASSA CRUD ---
  public getKassaRecords(): CashRecord[] {
    return [...this.kassa].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public addKassaRecord(data: {
    date: string;
    income: number;
    expense: number;
    note: string;
    category?: ExpenseCategory;
    startingBalance?: number;
  }): CashRecord {
    const income = Math.max(0, Number(data.income) || 0);
    const expense = Math.max(0, Number(data.expense) || 0);
    const category = data.category || deduceExpenseCategory(data.note);

    let startingBalance = data.startingBalance;
    if (startingBalance === undefined) {
      const sorted = [...this.kassa].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const prev = sorted.filter((k) => k.date < data.date).pop();
      startingBalance = prev ? prev.balance : 0;
    }

    const newRecord: CashRecord = {
      id: `kas-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: data.date,
      startingBalance,
      income,
      expense,
      balance: startingBalance + income - expense,
      category,
      note: data.note || '',
      createdBy: this.user.username || 'admin',
      createdByName: this.user.name || 'Bosh Administrator',
      createdAt: new Date().toISOString(),
    };

    this.kassa.push(newRecord);
    this.recalculateKassaChain();
    this.saveKassa();
    this.syncExpensesFromKassa();

    // Log action
    const actionDesc =
      income > 0 && expense > 0
        ? `Kirim: +${income.toLocaleString('uz-UZ')} soʻm, Chiqim: -${expense.toLocaleString('uz-UZ')} soʻm (${data.note || 'Izohsiz'})`
        : income > 0
        ? `Kirim: +${income.toLocaleString('uz-UZ')} soʻm (${data.note || 'Kunlik tushum'})`
        : `Chiqim: -${expense.toLocaleString('uz-UZ')} soʻm (${data.note || 'Xarajat'})`;

    this.logAction(
      'kassa_add',
      income > 0 ? 'Kassaga kirim kiritildi' : 'Kassadan chiqim qilindi',
      `Sana: ${data.date} | ${actionDesc}`
    );

    return newRecord;
  }

  public updateKassaRecord(id: string, data: Partial<CashRecord>): CashRecord | null {
    const idx = this.kassa.findIndex((k) => k.id === id);
    if (idx === -1) return null;

    const existing = this.kassa[idx];
    const income = data.income !== undefined ? Math.max(0, Number(data.income)) : existing.income;
    const expense = data.expense !== undefined ? Math.max(0, Number(data.expense)) : existing.expense;
    const note = data.note !== undefined ? data.note : existing.note;
    const category = data.category || deduceExpenseCategory(note);

    this.kassa[idx] = {
      ...existing,
      ...data,
      income,
      expense,
      note,
      category,
      updatedBy: this.user.username || 'admin',
    };

    this.recalculateKassaChain();
    this.saveKassa();
    this.syncExpensesFromKassa();

    // Log action
    this.logAction(
      'kassa_edit',
      'Kassa amali oʻzgartirildi',
      `Sana: ${this.kassa[idx].date} | Yangi kirim: ${income.toLocaleString('uz-UZ')} | Chiqim: ${expense.toLocaleString('uz-UZ')} | Izoh: ${note}`
    );

    return this.kassa[idx];
  }

  public deleteKassaRecord(id: string): boolean {
    const target = this.kassa.find((k) => k.id === id);
    if (!target) return false;

    this.kassa = this.kassa.filter((k) => k.id !== id);
    this.recalculateKassaChain();
    this.saveKassa();
    this.syncExpensesFromKassa();

    // Log action
    this.logAction(
      'kassa_delete',
      'Kassa yozuvi oʻchirildi',
      `Sana: ${target.date} | Kirim: ${target.income.toLocaleString('uz-UZ')} | Chiqim: ${target.expense.toLocaleString('uz-UZ')} | Izoh: ${target.note}`
    );

    return true;
  }

  // --- EXPENSES ---
  public getExpenses(): ExpenseRecord[] {
    return [...this.expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public addExpense(data: { date: string; amount: number; category: ExpenseCategory; note: string }): ExpenseRecord {
    const kassaItem = this.addKassaRecord({
      date: data.date,
      income: 0,
      expense: data.amount,
      note: data.note || `${data.amount} ${data.category}`,
      category: data.category,
    });

    const newExp: ExpenseRecord = {
      id: `exp-${kassaItem.id}`,
      date: data.date,
      amount: data.amount,
      category: data.category,
      note: data.note,
      sourceKassaId: kassaItem.id,
      createdBy: this.user.username || 'admin',
      createdByName: this.user.name || 'Bosh Administrator',
      createdAt: new Date().toISOString(),
    };

    return newExp;
  }

  // --- ACCOUNTS & AUTHENTICATION ---
  public getAccounts(): UserAccount[] {
    return [...this.accounts];
  }

  public hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  public register(data: {
    username: string;
    name: string;
    password: string;
    role?: 'admin' | 'kassir';
  }): { success: boolean; error?: string; user?: UserSession } {
    const cleanUsername = data.username.trim().toLowerCase();
    const cleanName = data.name.trim();
    const cleanPass = data.password.trim();

    if (!cleanUsername) {
      return { success: false, error: 'Login kiritilishi shart!' };
    }
    if (cleanUsername.length < 3) {
      return { success: false, error: 'Login kamida 3 ta belgidan iborat boʻlishi kerak!' };
    }
    if (!cleanPass || cleanPass.length < 4) {
      return { success: false, error: 'Parol kamida 4 ta belgidan iborat boʻlishi kerak!' };
    }
    if (this.accounts.some((a) => a.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: 'Ushbu login band! Boshqa login kiriting.' };
    }

    const newAcc: UserAccount = {
      id: `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      username: cleanUsername,
      name: cleanName || cleanUsername,
      password: cleanPass,
      role: data.role || (this.accounts.length === 0 ? 'admin' : 'kassir'),
      createdAt: new Date().toISOString(),
    };

    this.accounts.push(newAcc);
    this.saveAccounts();

    // Auto-login into session
    this.user = {
      username: newAcc.username,
      name: newAcc.name,
      role: newAcc.role,
      isLoggedIn: true,
      loginTime: new Date().toISOString(),
    };
    this.saveUser();

    this.logAction(
      'user_add',
      'Yangi akkaunt yaratildi',
      `@${newAcc.username} (${newAcc.name}) | Vazifasi: ${newAcc.role === 'admin' ? 'Bosh Admin' : 'Kassir'}`
    );

    return { success: true, user: this.user };
  }

  public loginWithCredentials(
    username: string,
    pass: string
  ): { success: boolean; error?: string; user?: UserSession } {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanUsername || !cleanPass) {
      return { success: false, error: 'Login va parolni toʻliq kiriting!' };
    }

    // If accounts list is empty, allow initial setup via login or check default
    if (this.accounts.length === 0) {
      // First account auto-create
      return this.register({
        username: cleanUsername,
        name: cleanUsername === 'asliddin' ? 'Asliddin Nurdinov' : 'Bosh Administrator',
        password: cleanPass,
        role: 'admin',
      });
    }

    const found = this.accounts.find(
      (a) => a.username.toLowerCase() === cleanUsername && a.password === cleanPass
    );

    if (found) {
      this.user = {
        username: found.username,
        name: found.name,
        role: found.role,
        isLoggedIn: true,
        loginTime: new Date().toISOString(),
      };
      this.saveUser();

      this.logAction(
        'user_login',
        'Tizimga kirildi',
        `@${found.username} (${found.name}) tizimga muvaffaqiyatli kirdi`
      );

      return { success: true, user: this.user };
    }

    return { success: false, error: 'Login yoki parol notoʻgʻri!' };
  }

  // Backwards compatibility method
  public login(password: string): boolean {
    if (this.accounts.length > 0) {
      // Check first account or any account matching password
      const match = this.accounts.find((a) => a.password === password.trim());
      if (match) {
        this.user = {
          username: match.username,
          name: match.name,
          role: match.role,
          isLoggedIn: true,
          loginTime: new Date().toISOString(),
        };
        this.saveUser();
        return true;
      }
    }
    const savedPass = localStorage.getItem('cargogo_master_password') || '123456';
    if (password === savedPass || password === 'admin' || password === 'cargogo') {
      this.user.isLoggedIn = true;
      this.user.loginTime = new Date().toISOString();
      this.saveUser();
      return true;
    }
    return false;
  }

  public logout(): void {
    this.user.isLoggedIn = false;
    this.saveUser();
  }

  public updateAccount(
    id: string,
    data: Partial<Pick<UserAccount, 'name' | 'username' | 'password' | 'role'>>
  ): { success: boolean; error?: string } {
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx === -1) return { success: false, error: 'Akkaunt topilmadi!' };

    if (data.username) {
      const cleanUser = data.username.trim().toLowerCase();
      if (this.accounts.some((a, i) => i !== idx && a.username.toLowerCase() === cleanUser)) {
        return { success: false, error: 'Bu login allaqachon mavjud!' };
      }
      this.accounts[idx].username = cleanUser;
    }
    if (data.name) this.accounts[idx].name = data.name.trim();
    if (data.password) this.accounts[idx].password = data.password.trim();
    if (data.role) this.accounts[idx].role = data.role;

    // Sync session if updating current active user
    if (this.user.username.toLowerCase() === this.accounts[idx].username.toLowerCase()) {
      this.user.name = this.accounts[idx].name;
      this.user.role = this.accounts[idx].role;
      this.saveUser();
    }

    this.saveAccounts();
    return { success: true };
  }

  public deleteAccount(id: string): { success: boolean; error?: string } {
    if (this.accounts.length <= 1) {
      return { success: false, error: 'Yagona administrator akkauntini oʻchirib boʻlmaydi!' };
    }
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc) return { success: false, error: 'Akkaunt topilmadi!' };

    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.saveAccounts();

    // If currently logged in user was deleted, logout
    if (this.user.username.toLowerCase() === acc.username.toLowerCase()) {
      this.logout();
    }
    return { success: true };
  }

  public getUser(): UserSession {
    return this.user;
  }

  public setUser(user: UserSession): void {
    this.user = user;
    this.saveUser();
  }

  public changePassword(newPass: string): void {
    localStorage.setItem('cargogo_master_password', newPass);
    // Also update current user account password
    const acc = this.accounts.find(
      (a) => a.username.toLowerCase() === this.user.username.toLowerCase()
    );
    if (acc) {
      acc.password = newPass;
      this.saveAccounts();
    }
  }

  // --- BULK IMPORT ---
  public importBulk(reportsToAdd: ReportRecord[], kassaToAdd: CashRecord[]): {
    reportsCount: number;
    kassaCount: number;
  } {
    if (reportsToAdd.length > 0) {
      this.reports = [...this.reports, ...reportsToAdd];
      this.saveReports();
    }
    if (kassaToAdd.length > 0) {
      this.kassa = [...this.kassa, ...kassaToAdd];
      this.recalculateKassaChain();
      this.saveKassa();
      this.syncExpensesFromKassa();
    }
    return {
      reportsCount: reportsToAdd.length,
      kassaCount: kassaToAdd.length,
    };
  }

  // Reset to original demo data
  public resetToSampleData(): void {
    this.reports = [...INITIAL_REPORTS];
    this.kassa = [...INITIAL_KASSA];
    this.recalculateKassaChain();
    this.saveReports();
    this.saveKassa();
    this.syncExpensesFromKassa();
  }

  // Clear all data
  public clearAllData(): void {
    this.reports = [];
    this.kassa = [];
    this.expenses = [];
    this.saveReports();
    this.saveKassa();
    this.saveExpenses();
  }

  // Theme management
  public getTheme(): 'dark' | 'light' {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  public setTheme(theme: 'dark' | 'light'): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch (err) {
      console.warn('Failed saving theme', err);
    }
  }
}

export const storage = new StorageService();
