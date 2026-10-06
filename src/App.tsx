import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { KassaView } from './components/KassaView';
import { OtchyotlarView } from './components/OtchyotlarView';
import { CashCardView } from './components/CashCardView';
import { DecadeView } from './components/DecadeView';
import { MonthlyView } from './components/MonthlyView';
import { ExpensesView } from './components/ExpensesView';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { QuickAddModal } from './components/QuickAddModal';
import { ExcelModal } from './components/ExcelModal';
import { LoginModal } from './components/LoginModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { AuditLogView } from './components/AuditLogView';

import { storage } from './services/storage';
import {
  calculateDashboardStats,
  calculateDecadeSummaries,
  calculateMonthlySummaries,
  calculateDailyCashCard,
} from './utils/calculations';
import { getTodayDateString } from './utils/formatters';
import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  ActiveTab,
  UserSession,
  ExpenseCategory,
  ActivityLog,
} from './types';

export default function App() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [kassa, setKassa] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [user, setUser] = useState<UserSession>(storage.getUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => storage.getTheme());

  // Sync theme with document root
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storage.setTheme(next);
  };

  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-29');

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string;
    type: 'report' | 'kassa' | 'expense';
    title: string;
    description: string;
  }>({
    isOpen: false,
    id: '',
    type: 'report',
    title: '',
    description: '',
  });

  // Reload data from storage
  const refreshData = () => {
    setReports(storage.getReports());
    setKassa(storage.getKassaRecords());
    setExpenses(storage.getExpenses());
    setLogs(storage.getLogs());
    setUser(storage.getUser());
  };

  useEffect(() => {
    refreshData();
    // Default to today or the latest available date
    const allRep = storage.getReports();
    if (allRep.length > 0) {
      setSelectedDate(allRep[0].date);
    } else {
      setSelectedDate(getTodayDateString());
    }

    // Subscribe to multi-device live server sync events
    const unsubscribe = storage.subscribe(() => {
      refreshData();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const restoreAuthSession = async () => {
      try {
        const response = await fetch('/api/auth/get-session', { cache: 'no-store' });
        const session = response.ok ? await response.json() : null;
        if (active && session?.user?.id && session.user.email) {
          await storage.setAuthenticatedUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          });
          if (active) refreshData();
        } else if (active) {
          storage.logout();
          setUser(storage.getUser());
        }
      } catch {
        if (active) {
          storage.logout();
          setUser(storage.getUser());
        }
      } finally {
        if (active) setIsAuthLoading(false);
      }
    };
    void restoreAuthSession();
    return () => { active = false; };
  }, []);

  // Role guard: cashiers cannot access kassa or auditLog
  useEffect(() => {
    if (user.role !== 'admin' && (activeTab === 'kassa' || activeTab === 'auditLog')) {
      setActiveTab('reports');
    }
  }, [user.role, activeTab]);

  // Recalculated metrics
  const dashboardStats = calculateDashboardStats(reports, kassa, expenses, selectedDate);
  const decadeSummaries = calculateDecadeSummaries(reports);
  const monthlySummaries = calculateMonthlySummaries(reports, kassa, expenses);
  const dailyCashCard = calculateDailyCashCard(reports);

  // Latest kassa balance
  const currentKassaBalance = kassa.length > 0 ? kassa[0].balance : 0;

  // Handlers for Reports
  const handleAddReport = (data: {
    date: string;
    idNumber: string;
    tripsCount: number;
    cash: number;
    card: number;
    yandex: number;
    pochta: number;
    note?: string;
  }) => {
    storage.addReport(data);
    refreshData();
    setSelectedDate(data.date);
  };

  const handleUpdateReport = (id: string, data: Partial<ReportRecord>) => {
    storage.updateReport(id, data);
    refreshData();
  };

  const requestDeleteReport = (id: string) => {
    setDeleteConfirm({
      isOpen: true,
      id,
      type: 'report',
      title: 'Otchyotni oʻchirish',
      description: 'Ushbu reys hisoboti oʻchiriladi. Bu amalni qaytarib boʻlmaydi.',
    });
  };

  // Handlers for Kassa
  const handleAddKassa = (data: {
    date: string;
    income: number;
    expense: number;
    note: string;
    category?: ExpenseCategory;
  }) => {
    storage.addKassaRecord(data);
    refreshData();
    setSelectedDate(data.date);
  };

  const handleUpdateKassa = (id: string, data: Partial<CashRecord>) => {
    storage.updateKassaRecord(id, data);
    refreshData();
  };

  const requestDeleteKassa = (id: string) => {
    setDeleteConfirm({
      isOpen: true,
      id,
      type: 'kassa',
      title: 'Kassa yozuvini oʻchirish',
      description: 'Kassa yozuvi oʻchirilgach, kassa qoldiqlari zanjiri avtomatik qayta hisoblanadi.',
    });
  };

  // Handlers for Expenses
  const handleAddExpense = (data: {
    date: string;
    amount: number;
    category: ExpenseCategory;
    note: string;
  }) => {
    storage.addExpense(data);
    refreshData();
    setSelectedDate(data.date);
  };

  const requestDeleteExpense = (id: string) => {
    setDeleteConfirm({
      isOpen: true,
      id,
      type: 'expense',
      title: 'Xarajatni oʻchirish',
      description: 'Ushbu xarajat yozuvi oʻchiriladi.',
    });
  };

  // Confirm delete execution
  const executeDelete = () => {
    if (deleteConfirm.type === 'report') {
      storage.deleteReport(deleteConfirm.id);
    } else if (deleteConfirm.type === 'kassa') {
      storage.deleteKassaRecord(deleteConfirm.id);
    } else if (deleteConfirm.type === 'expense') {
      // Find expense and delete its corresponding kassa record if linked
      const exp = expenses.find((e) => e.id === deleteConfirm.id);
      if (exp?.sourceKassaId) {
        storage.deleteKassaRecord(exp.sourceKassaId);
      }
    }
    refreshData();
  };

  // Bulk import
  const handleBulkImport = (newReports: ReportRecord[], newKassa: CashRecord[]) => {
    storage.importBulk(newReports, newKassa);
    refreshData();
  };

  // Reset to initial demo data
  const handleResetData = () => {
    storage.resetToSampleData();
    refreshData();
  };

  // Clear all data
  const handleClearData = () => {
    storage.clearAllData();
    refreshData();
  };

  // Login handler
  const completeAuth = async () => {
    const response = await fetch('/api/auth/get-session', { cache: 'no-store' });
    const session = response.ok ? await response.json() : null;
    if (!session?.user?.id || !session.user.email) {
      return { success: false, error: 'Sessiya ochilmadi. Qayta urinib ko‘ring.' };
    }
    await storage.setAuthenticatedUser({ id: session.user.id, email: session.user.email, name: session.user.name });
    refreshData();
    return { success: true };
  };

  const authErrorMessage = async (response: Response, fallback: string) => {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      const message = body?.message || body?.error?.message || body?.error || body?.code;
      return typeof message === 'string' && message ? message : fallback;
    } catch {
      return text && text.length < 240 ? text : fallback;
    }
  };

  const handleLogin = async (email: string, password: string) => {
    const response = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return { success: false, error: await authErrorMessage(response, 'Email yoki parol noto‘g‘ri.') };
    return completeAuth();
  };

  const handleRegister = async (email: string, name: string, password: string) => {
    const response = await fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    if (!response.ok) return { success: false, error: await authErrorMessage(response, 'Akkaunt yaratilmadi.') };
    return completeAuth();
  };

  const handleLogout = async () => {
    await storage.syncToServer();
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    storage.logout();
    setUser(storage.getUser());
  };

  // If user is not logged in, enforce security
  if (!user.isLoggedIn) {
    if (isAuthLoading) {
      return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">Sessiya tekshirilmoqda…</div>;
    }
    return (
      <LoginModal
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 pb-safe">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        kassaBalance={currentKassaBalance}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        openQuickAdd={() => setIsQuickAddOpen(true)}
        openExcelModal={() => setIsExcelModalOpen(true)}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            stats={dashboardStats}
            reports={reports}
            kassa={kassa}
            decadeSummaries={decadeSummaries}
            setActiveTab={setActiveTab}
            openQuickAdd={() => setIsQuickAddOpen(true)}
            openExcelModal={() => setIsExcelModalOpen(true)}
            onEditReport={(r) => handleUpdateReport(r.id, r)}
            onDeleteReport={requestDeleteReport}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            userRole={user.role}
          />
        )}

        {/* KASSA - FAQAT BOSH ADMINLAR UCHUN */}
        {activeTab === 'kassa' && user.role === 'admin' && (
          <KassaView
            kassa={kassa}
            onAddKassa={handleAddKassa}
            onUpdateKassa={handleUpdateKassa}
            onDeleteKassa={requestDeleteKassa}
            openQuickAdd={() => setIsQuickAddOpen(true)}
            openExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}

        {activeTab === 'reports' && (
          <OtchyotlarView
            reports={reports}
            onAddReport={handleAddReport}
            onUpdateReport={handleUpdateReport}
            onDeleteReport={requestDeleteReport}
            openQuickAdd={() => setIsQuickAddOpen(true)}
            openExcelModal={() => setIsExcelModalOpen(true)}
            todayDate={selectedDate}
            userRole={user.role}
          />
        )}

        {activeTab === 'cashCard' && (
          <CashCardView
            dailySummaries={dailyCashCard}
            openQuickAdd={() => setIsQuickAddOpen(true)}
            openExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}

        {activeTab === 'decade' && (
          <DecadeView
            decadeSummaries={decadeSummaries}
            openExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}

        {activeTab === 'monthly' && (
          <MonthlyView
            monthlySummaries={monthlySummaries}
            openExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView
            expenses={expenses}
            onAddExpense={handleAddExpense}
            onDeleteExpense={requestDeleteExpense}
            openQuickAdd={() => setIsQuickAddOpen(true)}
            openExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}

        {activeTab === 'search' && (
          <SearchView reports={reports} />
        )}

        {/* HARAKATLAR TARIXI - FAQAT BOSH ADMINLAR UCHUN */}
        {activeTab === 'auditLog' && user.role === 'admin' && (
          <AuditLogView
            logs={logs}
            onClearLogs={() => {
              storage.clearLogs();
              setLogs([]);
            }}
            currentUser={user}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            user={user}
            onLogout={handleLogout}
            onResetData={handleResetData}
            onClearData={handleClearData}
            reportsCount={reports.length}
            kassaCount={kassa.length}
            expensesCount={expenses.length}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openQuickAdd={() => setIsQuickAddOpen(true)}
        openExcelModal={() => setIsExcelModalOpen(true)}
        user={user}
      />

      {/* Modals */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        defaultDate={selectedDate}
        onAddReport={handleAddReport}
        onAddKassa={handleAddKassa}
        currentKassaBalance={currentKassaBalance}
      />

      <ExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        reports={reports}
        kassa={kassa}
        expenses={expenses}
        decadeSummaries={decadeSummaries}
        monthlySummaries={monthlySummaries}
        todayDate={selectedDate}
        onBulkImport={handleBulkImport}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
        onConfirm={executeDelete}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
      />
    </div>
  );
}
