import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { duration, markAttendance, minutesBetween } from '../lib/attendance';
import { nowMs, timeOf } from '../lib/format';
import { useApi, useLive } from '../lib/live';
import type { MyAttendance } from '../lib/types';
import { Button, Modal, cx, useToast } from './ui';

/** Re-renders every minute so "at work for…" stays current. */
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
}

export function useAttendanceActions() {
  const me = useApi<MyAttendance>('/attendance/me');
  const { bump } = useLive();
  const toast = useToast();
  const [busy, setBusy] = useState<'check-in' | 'check-out' | null>(null);

  async function mark(kind: 'check-in' | 'check-out') {
    setBusy(kind);
    try {
      await markAttendance(kind, Boolean(me.data?.officeSet));
      toast({ tone: 'success', title: kind === 'check-in' ? 'Kelganingiz belgilandi' : 'Ketganingiz belgilandi', description: timeOf(new Date(nowMs()).toISOString()) });
      bump();
      me.reload();
      return true;
    } catch (e) {
      toast({ tone: 'error', title: kind === 'check-in' ? 'Kelish belgilanmadi' : 'Ketish belgilanmadi', description: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { me, busy, mark };
}

/** "Keldim" / "Ketdim" in the page header, for every signed-in person. */
export function AttendanceButton() {
  const { me, busy, mark } = useAttendanceActions();
  const [confirm, setConfirm] = useState(false);
  useMinuteTick();
  if (!me.data) return null;
  const open = me.data.open;

  if (!open) {
    return (
      <Button variant="success" size="sm" loading={busy === 'check-in'} icon={<LogIn className="size-4" />} onClick={() => void mark('check-in')}>
        Keldim
      </Button>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setConfirm(true)}
        className={cx('inline-flex h-8 items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 text-xs font-medium text-success transition-colors hover:bg-success/15')}>
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>
        <span className="hidden sm:inline">Ishda</span>
        <span className="num">{duration(minutesBetween(open.check_in_at, nowMs()))}</span>
        <LogOut className="size-3.5" />
      </button>
      <Modal open={confirm} onClose={() => setConfirm(false)} size="sm" title="Ishdan ketyapsizmi?"
        description={`${timeOf(open.check_in_at)} da kelgansiz · ${duration(minutesBetween(open.check_in_at, nowMs()))} ishladingiz`}
        footer={<>
          <Button onClick={() => setConfirm(false)}>Yoʻq</Button>
          <Button variant="primary" loading={busy === 'check-out'} icon={<LogOut className="size-4" />} onClick={async () => { if (await mark('check-out')) setConfirm(false); }}>Ketdim</Button>
        </>}>
        <p className="text-sm text-ink-2">“Ketdim” bosilgandan keyin bugungi ish vaqtingiz yopiladi. Qaytib kelsangiz, yana “Keldim” ni bosasiz.</p>
      </Modal>
    </>
  );
}
