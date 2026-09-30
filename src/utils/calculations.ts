import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  DecadeSummary,
  MonthlySummary,
  DailyCashCardSummary,
} from '../types';
import { getDecadeInfo, getMonthNameUz } from './formatters';

export function calculateDashboardStats(
  reports: ReportRecord[],
  kassa: CashRecord[],
  expenses: ExpenseRecord[],
  selectedDate: string
) {
  // 1. Bugungi otchyotlar (reports for selectedDate, default today e.g. 2026-09-29)
  const todayReports = reports.filter((r) => r.date === selectedDate);
  const bugungiNaqd = todayReports.reduce((s, r) => s + (r.cash || 0), 0);
  const bugungiKarta = todayReports.reduce((s, r) => s + (r.card || 0), 0);
  const bugungiYandex = todayReports.reduce((s, r) => s + (r.yandex || 0), 0);
  const bugungiPochta = todayReports.reduce((s, r) => s + (r.pochta || 0), 0);
  const bugungiUmumiyKassa = bugungiNaqd + bugungiKarta + bugungiYandex + bugungiPochta;
  const bugungiReyslar = todayReports.reduce((s, r) => s + (r.tripsCount || 0), 0);
  const bugungiIdlarSoni = new Set(todayReports.map((r) => r.idNumber)).size;

  // 2. Kassa stats
  const sortedKassa = [...kassa].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestKassaRecord = sortedKassa.length > 0 ? sortedKassa[sortedKassa.length - 1] : null;
  const kassadagiQoldiq = latestKassaRecord ? latestKassaRecord.balance : 0;

  const todayKassa = kassa.find((k) => k.date === selectedDate);
  const bugungiKassaTushum = todayKassa ? todayKassa.income : 0;
  const bugungiXarajat = todayKassa ? todayKassa.expense : 0;

  // 3. Shu oy stats (based on month of selectedDate, e.g. "2026-09")
  const currentMonthKey = selectedDate.substring(0, 7); // "YYYY-MM"
  const monthReports = reports.filter((r) => r.date.startsWith(currentMonthKey));
  const shuOyJamiTushum = monthReports.reduce((s, r) => s + (r.total || 0), 0);
  const shuOyJamiReyslar = monthReports.reduce((s, r) => s + (r.tripsCount || 0), 0);

  const monthExpenses = expenses.filter((e) => e.date.startsWith(currentMonthKey));
  const shuOyJamiXarajat = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  const monthKassa = kassa.filter((k) => k.date.startsWith(currentMonthKey));
  const monthLastKassa = monthKassa.length > 0 ? monthKassa[monthKassa.length - 1] : latestKassaRecord;
  const shuOyOxiridagiKassa = monthLastKassa ? monthLastKassa.balance : kassadagiQoldiq;

  // 4. 10 kunlik kassa (current decade of selectedDate)
  const currentDecade = getDecadeInfo(selectedDate);
  const decadeReports = reports.filter((r) => {
    if (!r.date.startsWith(currentMonthKey)) return false;
    const dec = getDecadeInfo(r.date);
    return dec.index === currentDecade.index;
  });
  const decade10KunlikKassa = decadeReports.reduce((s, r) => s + (r.total || 0), 0);
  const decade10KunlikReyslar = decadeReports.reduce((s, r) => s + (r.tripsCount || 0), 0);

  return {
    selectedDate,
    bugungiUmumiyKassa,
    bugungiNaqd,
    bugungiKarta,
    bugungiYandex,
    bugungiPochta,
    bugungiReyslar,
    bugungiIdlarSoni,
    kassadagiQoldiq,
    bugungiKassaTushum,
    bugungiXarajat,
    shuOyJamiTushum,
    shuOyJamiReyslar,
    shuOyJamiXarajat,
    shuOyOxiridagiKassa,
    decade10KunlikKassa,
    decade10KunlikReyslar,
    currentDecadeLabel: currentDecade.label,
  };
}

export function calculateDecadeSummaries(reports: ReportRecord[]): DecadeSummary[] {
  const map = new Map<string, DecadeSummary>();

  reports.forEach((r) => {
    const { index, label, decadeKey } = getDecadeInfo(r.date);
    const month = r.date.substring(0, 7);

    const prev = map.get(decadeKey) || {
      decadeKey,
      periodLabel: `${label} (${getMonthNameUz(month)})`,
      month,
      decadeIndex: index,
      tripsCount: 0,
      cash: 0,
      card: 0,
      yandex: 0,
      pochta: 0,
      total: 0,
      recordsCount: 0,
    };

    map.set(decadeKey, {
      ...prev,
      tripsCount: prev.tripsCount + (r.tripsCount || 0),
      cash: prev.cash + (r.cash || 0),
      card: prev.card + (r.card || 0),
      yandex: prev.yandex + (r.yandex || 0),
      pochta: prev.pochta + (r.pochta || 0),
      total: prev.total + (r.total || 0),
      recordsCount: prev.recordsCount + 1,
    });
  });

  return Array.from(map.values()).sort((a, b) => b.decadeKey.localeCompare(a.decadeKey));
}

export function calculateMonthlySummaries(
  reports: ReportRecord[],
  kassa: CashRecord[],
  expenses: ExpenseRecord[]
): MonthlySummary[] {
  // Collect all distinct months
  const months = new Set<string>();
  reports.forEach((r) => months.add(r.date.substring(0, 7)));
  kassa.forEach((k) => months.add(k.date.substring(0, 7)));
  expenses.forEach((e) => months.add(e.date.substring(0, 7)));

  const list: MonthlySummary[] = [];

  Array.from(months)
    .sort()
    .reverse()
    .forEach((monthKey) => {
      const rep = reports.filter((r) => r.date.startsWith(monthKey));
      const kas = kassa.filter((k) => k.date.startsWith(monthKey)).sort((a, b) => a.date.localeCompare(b.date));
      const exp = expenses.filter((e) => e.date.startsWith(monthKey));

      const tripsCount = rep.reduce((s, r) => s + (r.tripsCount || 0), 0);
      const cash = rep.reduce((s, r) => s + (r.cash || 0), 0);
      const card = rep.reduce((s, r) => s + (r.card || 0), 0);
      const yandex = rep.reduce((s, r) => s + (r.yandex || 0), 0);
      const pochta = rep.reduce((s, r) => s + (r.pochta || 0), 0);
      const totalRevenue = cash + card + yandex + pochta;

      const kassaIncome = kas.reduce((s, k) => s + (k.income || 0), 0);
      const kassaExpense = exp.reduce((s, e) => s + (e.amount || 0), 0);
      const kassaFinalBalance = kas.length > 0 ? kas[kas.length - 1].balance : 0;

      list.push({
        monthKey,
        monthName: getMonthNameUz(monthKey),
        tripsCount,
        cash,
        card,
        yandex,
        pochta,
        totalRevenue,
        kassaIncome,
        kassaExpense,
        kassaFinalBalance,
        reportsCount: rep.length,
      });
    });

  return list;
}

export function calculateDailyCashCard(reports: ReportRecord[]): DailyCashCardSummary[] {
  const map = new Map<string, DailyCashCardSummary>();

  reports.forEach((r) => {
    const prev = map.get(r.date) || {
      date: r.date,
      cash: 0,
      card: 0,
      total: 0,
      tripsCount: 0,
      sourceReportsCount: 0,
    };

    map.set(r.date, {
      date: r.date,
      cash: prev.cash + (r.cash || 0),
      card: prev.card + (r.card || 0),
      total: prev.total + ((r.cash || 0) + (r.card || 0)),
      tripsCount: prev.tripsCount + (r.tripsCount || 0),
      sourceReportsCount: prev.sourceReportsCount + 1,
    });
  });

  return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
