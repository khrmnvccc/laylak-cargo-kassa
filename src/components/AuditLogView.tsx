import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  User,
  Clock,
  Trash2,
  FileSpreadsheet,
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  Trash,
  LogIn,
  UserCheck,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { ActivityLog, UserSession } from '../types';
import { formatDateTime } from '../utils/formatters';

interface AuditLogViewProps {
  logs: ActivityLog[];
  onClearLogs: () => void;
  currentUser: UserSession;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs,
  onClearLogs,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Extract unique users from logs
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((log) => {
      if (log.authorUsername) {
        map.set(log.authorUsername, log.authorName || log.authorUsername);
      }
    });
    return Array.from(map.entries()).map(([username, name]) => ({ username, name }));
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // User filter
      if (selectedUser !== 'all' && log.authorUsername.toLowerCase() !== selectedUser.toLowerCase()) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'report' && !log.actionType.startsWith('report_')) return false;
        if (selectedCategory === 'kassa' && !log.actionType.startsWith('kassa_')) return false;
        if (selectedCategory === 'expense' && !log.actionType.startsWith('expense_')) return false;
        if (selectedCategory === 'user' && !log.actionType.startsWith('user_')) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = log.title.toLowerCase().includes(query);
        const matchDesc = log.description.toLowerCase().includes(query);
        const matchUser = log.authorUsername.toLowerCase().includes(query) || log.authorName.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchUser) return false;
      }

      return true;
    });
  }, [logs, selectedUser, selectedCategory, searchTerm]);

  const getActionBadge = (actionType: ActivityLog['actionType']) => {
    switch (actionType) {
      case 'report_add':
        return {
          icon: <FileText className="w-3.5 h-3.5" />,
          label: 'Otchyot qoʻshildi',
          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
      case 'report_edit':
        return {
          icon: <Edit3 className="w-3.5 h-3.5" />,
          label: 'Otchyot tahrirlandi',
          color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'report_delete':
        return {
          icon: <Trash className="w-3.5 h-3.5" />,
          label: 'Otchyot oʻchirildi',
          color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        };
      case 'kassa_add':
        return {
          icon: <ArrowUpRight className="w-3.5 h-3.5" />,
          label: 'Kassa harakati',
          color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        };
      case 'kassa_edit':
        return {
          icon: <Edit3 className="w-3.5 h-3.5" />,
          label: 'Kassa oʻzgartirildi',
          color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
        };
      case 'kassa_delete':
        return {
          icon: <Trash className="w-3.5 h-3.5" />,
          label: 'Kassa yozuvi oʻchirildi',
          color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        };
      case 'expense_add':
        return {
          icon: <ArrowDownRight className="w-3.5 h-3.5" />,
          label: 'Xarajat qilindi',
          color: 'bg-amber-600/15 text-amber-300 border-amber-600/30',
        };
      case 'expense_delete':
        return {
          icon: <Trash className="w-3.5 h-3.5" />,
          label: 'Xarajat oʻchirildi',
          color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        };
      case 'user_login':
        return {
          icon: <LogIn className="w-3.5 h-3.5" />,
          label: 'Tizimga kirish',
          color: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        };
      case 'user_add':
        return {
          icon: <UserCheck className="w-3.5 h-3.5" />,
          label: 'Yangi akkaunt',
          color: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        };
      default:
        return {
          icon: <History className="w-3.5 h-3.5" />,
          label: 'Harakat',
          color: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span>Harakatlar Tarixi</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                Audit Log
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Kim qachon qaysi otchyotni kiritgan, oʻzgartirgan yoki kassa kirim-chiqimini bajarganini kuzatish
            </p>
          </div>
        </div>

        {currentUser.role === 'admin' && logs.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Barcha harakatlar tarixini tozalashni tasdiqlaysizmi?')) {
                onClearLogs();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-all active:scale-95"
            title="Tarixni tozalash"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Tarixni tozalash</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Izoh, ID yoki foydalanuvchi boʻyicha qidirish..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* User filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
            >
              <option value="all">Barcha xodimlar</option>
              {uniqueUsers.map((u) => (
                <option key={u.username} value={u.username}>
                  @{u.username} ({u.name})
                </option>
              ))}
            </select>
            <User className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Action category filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
            >
              <option value="all">Barcha amallar</option>
              <option value="report">Faqat Otchyotlar</option>
              <option value="kassa">Faqat Kassa harakatlari</option>
              <option value="expense">Faqat Xarajatlar</option>
              <option value="user">Kirish & Akkauntlar</option>
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Logs Timeline / List */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-semibold">
          <span>Qaydlar roʻyxati ({filteredLogs.length} ta)</span>
          <span className="text-[11px] text-slate-500">Eng soʻnggi amallar yuqorida</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <History className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Mos keluvchi harakatlar topilmadi</p>
            <p className="text-xs text-slate-500">
              Qidiruv shartlarini oʻzgartiring yoki filtrlarni tozalang
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 max-h-[650px] overflow-y-auto">
            {filteredLogs.map((log) => {
              const badge = getActionBadge(log.actionType);
              return (
                <div
                  key={log.id}
                  className="p-4 sm:p-5 hover:bg-slate-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  {/* Left: Author + Action Info */}
                  <div className="flex items-start gap-3.5">
                    {/* Author Initial Circle */}
                    <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center font-bold text-amber-400 flex-shrink-0 shadow-sm mt-0.5">
                      <span className="text-sm leading-none">
                        {(log.authorName || log.authorUsername || 'A').charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono leading-none mt-1">
                        {log.authorRole === 'admin' ? 'ADM' : 'KAS'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-bold text-white text-sm">
                          {log.authorName || log.authorUsername}
                        </span>
                        <span className="text-amber-400 font-mono text-[11px]">
                          @{log.authorUsername}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      <p className="text-slate-200 font-medium text-xs leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Timestamp */}
                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between text-slate-400 text-[11px] font-mono flex-shrink-0 pt-1 sm:pt-0">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{formatDateTime(log.timestamp)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
