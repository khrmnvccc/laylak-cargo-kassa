import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { api } from '../lib/api';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { Badge, Button, Card, CardHeader, IconButton, Modal, cx, useToast } from './ui';

// Site notifications on this device: the bell at the top, the first-visit question and the card in Sozlamalar
// all show the same state, so a change in one is seen by the others.

const listeners = new Set<(s: PushState) => void>();
let current: PushState | null = null;
let loading: Promise<PushState> | null = null;

function publish(s: PushState) {
  current = s;
  listeners.forEach((fn) => fn(s));
}

function usePushState(): [PushState | null, (s: PushState) => void] {
  const [state, setState] = useState<PushState | null>(current);
  useEffect(() => {
    listeners.add(setState);
    if (current === null) {
      loading ??= pushState().catch((): PushState => 'unsupported');
      void loading.then(publish);
    }
    return () => { listeners.delete(setState); };
  }, []);
  return [state, publish];
}

const ASKED = 'lk_push_asked';
const asked = () => { try { return localStorage.getItem(ASKED) === '1'; } catch { return true; } };
const markAsked = () => { try { localStorage.setItem(ASKED, '1'); } catch { /* storage blocked */ } };

function PushControls({ state, setState, compact }: { state: PushState | null; setState: (s: PushState) => void; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast({ tone: 'error', title: (e as Error).message }); } finally { setBusy(false); }
  }
  if (state === null) return <div className="skeleton h-9" />;
  if (state === 'on') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<BellRing className="size-4" />} loading={busy}
          onClick={() => run(async () => { await api('/push/test', { method: 'POST' }); toast({ tone: 'success', title: 'Sinov yuborildi' }); })}>Sinab koʻrish</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => setState(await disablePush()))}>Oʻchirish</Button>
      </div>
    );
  }
  if (state === 'off') {
    return (
      <Button size={compact ? 'md' : 'sm'} variant="primary" icon={<Bell className="size-4" />} loading={busy}
        onClick={() => run(async () => {
          const s = await enablePush();
          setState(s);
          if (s === 'on') toast({ tone: 'success', title: 'Bildirishnomalar yoqildi' });
        })}>Yoqish</Button>
    );
  }
  return (
    <p className="text-sm text-ink-2">
      {state === 'ios-install' ? 'iPhoneʼda: Safari → Ulashish → “Bosh ekranga qoʻshish”. Keyin saytni oʻsha belgidan ochib, shu yerda yoqing.'
        : state === 'denied' ? 'Bildirishnomalar taqiqlangan. Brauzer sozlamalarida bu saytga ruxsat bering.'
          : 'Bu brauzer bildirishnomalarni qoʻllamaydi. Chrome yoki bosh ekranga qoʻshilgan saytdan foydalaning.'}
    </p>
  );
}

const WHAT = 'Toʻlov, bekor qilish va boshqa kassa xabarlari shu qurilmaga keladi, sayt yopiq boʻlsa ham.';

/** Sozlamalar card, for everyone. */
export function PushCard() {
  const [state, setState] = usePushState();
  return (
    <Card className="self-start">
      <CardHeader title="Bildirishnomalar" subtitle={WHAT}
        action={state === 'on' ? <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />Yoqilgan</Badge> : undefined} />
      <PushControls state={state} setState={setState} />
    </Card>
  );
}

/** The bell in the top bar; asks once on the first visit while notifications are off. */
export function PushBell() {
  const [state, setState] = usePushState();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if ((state !== 'off' && state !== 'ios-install') || asked()) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => { if (state === 'on' && open) { markAsked(); setOpen(false); } }, [state, open]);
  if (state === null || state === 'unsupported') return null;
  const close = () => { markAsked(); setOpen(false); };
  const off = state !== 'on';
  return (
    <>
      <IconButton label="Bildirishnomalar" className="relative" onClick={() => setOpen(true)}>
        {state === 'denied' ? <BellOff className="size-[18px]" /> : <Bell className="size-[18px]" />}
        {off && <span className={cx('absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-surface', state === 'denied' ? 'bg-ink-3' : 'bg-danger')} />}
      </IconButton>
      <Modal open={open} onClose={close} size="sm" title={state === 'on' ? 'Bildirishnomalar yoqilgan' : 'Bildirishnomalarni yoqing'} description={WHAT}
        footer={<Button variant="ghost" onClick={close}>{state === 'on' ? 'Yopish' : 'Keyinroq'}</Button>}>
        <PushControls state={state} setState={setState} compact />
      </Modal>
    </>
  );
}
