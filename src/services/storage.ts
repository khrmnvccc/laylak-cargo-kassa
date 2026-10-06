import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  ExpenseCategory,
  UserSession,
  ActivityLog,
} from '../types';
import { getDecadeInfo } from '../utils/formatters';

const STORAGE_KEYS = {
  REPORTS: 'cargogo_reports_v2',
  KASSA: 'cargogo_kassa_v2',
  EXPENSES: 'cargogo_expenses_v2',
  USER: 'cargogo_user_v2',
  SETTINGS: 'cargogo_settings_v2',
  LOGS: 'cargogo_logs_v2',
  THEME: 'cargogo_theme_v2',
  DELETED_IDS: 'cargogo_deleted_ids_v1',
  LEGACY_SAMPLE_CLEANUP: 'cargogo_legacy_sample_cleanup_v1',
  AUTH_OWNER: 'cargogo_auth_owner_v1',
};

const LEGACY_SAMPLE_RECORD_IDS = [
  ...Array.from({ length: 8 }, (_, index) => `rep-${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `kas-${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `exp-kas-${index + 1}`),
  'log-init-1',
  'log-init-2',
  'log-init-3',
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

function recordTimestamp(record: { updatedAt?: string; createdAt?: string; timestamp?: string }): number {
  const value = Date.parse(record.updatedAt || record.createdAt || record.timestamp || '');
  return Number.isFinite(value) ? value : 0;
}

function mergeRecords<T extends { id: string; updatedAt?: string; createdAt?: string; timestamp?: string }>(
  remote: unknown,
  local: T[],
  deleted: Set<string>,
): T[] {
  const merged = new Map<string, T>();
  for (const record of Array.isArray(remote) ? remote as T[] : []) {
    if (record?.id && !deleted.has(record.id)) merged.set(record.id, record);
  }
  for (const record of local) {
    if (!record?.id || deleted.has(record.id)) continue;
    const existing = merged.get(record.id);
    if (!existing || recordTimestamp(record) >= recordTimestamp(existing)) merged.set(record.id, record);
  }
  return [...merged.values()];
}

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
  private isInitializing = true;
  private hasPendingServerSync = false;
  private authUserId = '';
  private deletedIds = new Map<string, string>();
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
      const storedDeletedIds = localStorage.getItem(STORAGE_KEYS.DELETED_IDS);
      if (storedDeletedIds) {
        const parsed = JSON.parse(storedDeletedIds);
        if (Array.isArray(parsed)) {
          this.deletedIds = new Map(parsed.filter((entry): entry is [string, string] =>
            Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string'
          ));
        }
      }
      const storedReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (storedReports) {
        this.reports = JSON.parse(storedReports);
      } else {
        this.reports = [];
        this.saveReportsOnly();
      }

      const storedKassa = localStorage.getItem(STORAGE_KEYS.KASSA);
      if (storedKassa) {
        this.kassa = JSON.parse(storedKassa);
      } else {
        this.kassa = [];
        this.saveKassaOnly();
      }

      const storedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      if (storedExpenses) {
        this.expenses = JSON.parse(storedExpenses);
      } else {
        this.syncExpensesFromKassa();
      }

      // Authentication is handled by Neon Auth. Never load or seed local plaintext passwords.
      const storedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (storedLogs) {
        this.logs = JSON.parse(storedLogs);
      } else {
        this.logs = [];
        this.saveLogsOnly();
      }

      if (localStorage.getItem(STORAGE_KEYS.LEGACY_SAMPLE_CLEANUP) !== 'true') {
        const cleanupDate = new Date().toISOString();
        for (const id of LEGACY_SAMPLE_RECORD_IDS) this.deletedIds.set(id, cleanupDate);
        const deleted = new Set(LEGACY_SAMPLE_RECORD_IDS);
        this.reports = this.reports.filter((record) => !deleted.has(record.id));
        this.kassa = this.kassa.filter((record) => !deleted.has(record.id));
        this.expenses = this.expenses.filter((record) =>
          !deleted.has(record.id) && !(record.sourceKassaId && deleted.has(record.sourceKassaId))
        );
        this.logs = this.logs.filter((record) => !deleted.has(record.id));
        this.saveReportsOnly();
        this.saveKassaOnly();
        this.saveExpensesOnly();
        this.saveLogsOnly();
        this.saveDeletedIds();
        localStorage.setItem(STORAGE_KEYS.LEGACY_SAMPLE_CLEANUP, 'true');
      }

      // A local flag is never enough to authenticate. The app restores the
      // session from Neon Auth on each load before enabling data sync.
      this.user = { username: '', name: '', role: 'kassir', isLoggedIn: false, loginTime: '' };
    } catch (e) {
      console.error('Storage initialization error:', e);
      this.reports = [];
      this.kassa = [];
    } finally {
      this.isInitializing = false;
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
          updatedAt: k.updatedAt,
        });
      }
    });
    this.expenses = list;
    this.saveExpenses();
  }

  public handleServerData(data: any): boolean {
    if (!data) return false;
    let hasChanges = false;

    if (Array.isArray(data.deletedIds)) {
      for (const id of data.deletedIds) {
        if (typeof id === 'string' && !this.deletedIds.has(id)) {
          this.deletedIds.set(id, '');
          hasChanges = true;
        }
      }
      this.saveDeletedIds();
    }

    const deleted = new Set(this.deletedIds.keys());

    const reports = Array.isArray(data.reports) ? mergeRecords<ReportRecord>(data.reports, this.reports, deleted) : null;
    if (reports && JSON.stringify(this.reports) !== JSON.stringify(reports)) {
      this.reports = reports;
      this.saveReportsOnly();
      hasChanges = true;
    }

    const kassa = Array.isArray(data.kassa) ? mergeRecords<CashRecord>(data.kassa, this.kassa, deleted) : null;
    if (kassa && JSON.stringify(this.kassa) !== JSON.stringify(kassa)) {
      this.kassa = kassa;
      this.saveKassaOnly();
      hasChanges = true;
    }

    const expenses = Array.isArray(data.expenses) ? mergeRecords<ExpenseRecord>(data.expenses, this.expenses, deleted)
      .filter((record) => !(record.sourceKassaId && deleted.has(record.sourceKassaId))) : null;
    if (expenses && JSON.stringify(this.expenses) !== JSON.stringify(expenses)) {
      this.expenses = expenses;
      this.saveExpensesOnly();
      hasChanges = true;
    }

    const logs = Array.isArray(data.logs) ? mergeRecords<ActivityLog>(data.logs, this.logs, deleted) : null;
    if (logs && JSON.stringify(this.logs) !== JSON.stringify(logs)) {
      this.logs = logs;
      this.saveLogsOnly();
      hasChanges = true;
    }

    if (hasChanges) {
      this.notifyListeners();
    }
    return hasChanges;
  }

  private saveDeletedIds(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(Array.from(this.deletedIds.entries())));
    } catch (err) {
      console.warn('Failed saving synchronized delete markers', err);
    }
  }

  private markDeleted(...ids: string[]): void {
    const deletedAt = new Date().toISOString();
    for (const id of ids) {
      if (id) this.deletedIds.set(id, deletedAt);
    }
    this.saveDeletedIds();
  }

  private clearDeleteMarkersFor(ids: string[]): void {
    for (const id of ids) this.deletedIds.delete(id);
    this.saveDeletedIds();
  }

  public async syncToServer(): Promise<boolean> {
    if (!this.user.isLoggedIn || !this.authUserId) return false;
    try {
      const response = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reports: this.reports,
          kassa: this.kassa,
          expenses: this.expenses,
          logs: this.logs,
          deletedIds: Array.from(this.deletedIds.keys()),
        }),
      });
      if (!response.ok) {
        this.isServerConnected = false;
        return false;
      }
      const data = await response.json();
      this.isServerConnected = true;
      this.lastServerTimestamp = data.updatedAt || this.lastServerTimestamp;
      this.hasPendingServerSync = false;
      this.handleServerData(data);
      return true;
    } catch {
      this.isServerConnected = false;
      return false;
    }
  }

  public async fetchServerData(): Promise<boolean> {
    if (!this.user.isLoggedIn || !this.authUserId || this.isSyncing) return false;
    try {
      this.isSyncing = true;
      const response = await fetch('/api/data', { cache: 'no-store' });
      if (!response.ok) {
        this.isServerConnected = false;
        return false;
      }
      const data = await response.json();
      if (!data.success) {
        this.isServerConnected = false;
        return false;
      }
      this.isServerConnected = true;
      const remoteHasData = [data.reports, data.kassa, data.expenses, data.logs]
        .some((items) => Array.isArray(items) && items.length > 0);
      const localHasData = this.reports.length + this.kassa.length + this.expenses.length + this.logs.length > 0;
      this.lastServerTimestamp = data.updatedAt || '';
      if (!remoteHasData && localHasData) {
        await this.syncToServer();
      } else {
        this.handleServerData(data);
        const localIsAhead = ['reports', 'kassa', 'expenses', 'logs'].some((key) =>
          JSON.stringify((this as any)[key]) !== JSON.stringify(Array.isArray(data[key]) ? data[key] : [])
        ) || [...this.deletedIds.keys()].some((id) => !data.deletedIds?.includes(id));
        if (localIsAhead) await this.syncToServer();
      }
      return true;
    } catch {
      this.isServerConnected = false;
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  public async setAuthenticatedUser(identity: { id: string; email: string; name?: string }): Promise<void> {
    let previousOwner = '';
    try { previousOwner = localStorage.getItem(STORAGE_KEYS.AUTH_OWNER) || ''; } catch { /* private browsing */ }
    if ((this.authUserId && this.authUserId !== identity.id) || (previousOwner && previousOwner !== identity.id)) {
      this.reports = [];
      this.kassa = [];
      this.expenses = [];
      this.logs = [];
      this.deletedIds.clear();
      this.saveReportsOnly();
      this.saveKassaOnly();
      this.saveExpensesOnly();
      this.saveLogsOnly();
      this.saveDeletedIds();
    }
    this.authUserId = identity.id;
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_OWNER, identity.id);
    } catch {
      // Auth cookies remain the source of truth if browser storage is unavailable.
    }
    this.user = {
      username: identity.email,
      name: identity.name || identity.email,
      role: 'admin',
      isLoggedIn: true,
      loginTime: new Date().toISOString(),
    };
    this.notifyListeners();
    await this.fetchServerData();
  }

  public triggerSync(): void {
    if (this.isInitializing || !this.user.isLoggedIn) return;
    this.hasPendingServerSync = true;
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      void this.syncToServer();
    }, 300);
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
      updatedAt: new Date().toISOString(),
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

    this.markDeleted(id);
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
      updatedAt: new Date().toISOString(),
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

    const linkedExpenseIds = this.expenses.filter((expense) => expense.sourceKassaId === id).map((expense) => expense.id);
    this.markDeleted(id, ...linkedExpenseIds);
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

  public logout(): void {
    this.authUserId = '';
    this.user = { username: '', name: '', role: 'kassir', isLoggedIn: false, loginTime: '' };
    this.notifyListeners();
  }

  public getUser(): UserSession {
    return this.user;
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
    this.markDeleted(
      ...this.reports.map((record) => record.id),
      ...this.kassa.map((record) => record.id),
      ...this.expenses.map((record) => record.id),
    );
    this.reports = [...INITIAL_REPORTS];
    this.kassa = [...INITIAL_KASSA];
    const sampleIds = [
      ...this.reports.map((record) => record.id),
      ...this.kassa.map((record) => record.id),
      ...this.kassa.map((record) => `exp-${record.id}`),
    ];
    this.clearDeleteMarkersFor(sampleIds);
    const resetAt = new Date().toISOString();
    this.reports = this.reports.map((record) => ({ ...record, updatedAt: resetAt }));
    this.kassa = this.kassa.map((record) => ({ ...record, updatedAt: resetAt }));
    this.recalculateKassaChain();
    this.saveReports();
    this.saveKassa();
    this.syncExpensesFromKassa();
  }

  // Clear all data
  public clearAllData(): void {
    this.markDeleted(
      ...this.reports.map((record) => record.id),
      ...this.kassa.map((record) => record.id),
      ...this.expenses.map((record) => record.id),
    );
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
