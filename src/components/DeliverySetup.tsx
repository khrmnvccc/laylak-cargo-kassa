import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/live';
import { yandexPlaceUrl, type Point } from '../lib/delivery';
import { Toggle } from './TelegramTemplates';
import { Alert, Button, Card, CardHeader, Field, Input, Modal, useToast } from './ui';

// Sozlamalar → Yetkazish (owner only): the bot that takes locations, and where every run starts from.

interface Setup {
  start: (Point & { label?: string; from: 'set' | 'office' }) | null;
  bot: { connected: boolean; on: boolean; botName: string | null };
}

export function DeliverySetupCard() {
  const toast = useToast();
  const { data, reload } = useApi<Setup>('/delivery');
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const bot = data?.bot;
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await api('/delivery/bot', { method: 'POST', body: { on } });
      toast({ tone: 'success', title: on ? 'Bot manzil qabul qiladi' : 'Bot manzil qabul qilmaydi' });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="self-start">
      <CardHeader title="Yetkazish" subtitle="Faqat Ega koʻradi" />
      <div className="divide-y divide-line">
        <div className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Telegram bot</div>
              <div className="text-[13px] text-ink-3">{bot?.botName ? `@${bot.botName}: lokatsiyalarni qabul qiladi` : 'Lokatsiyalarni botga yuborasiz'}</div>
            </div>
            {bot?.connected && <Toggle on={bot.on} disabled={busy} label="Botdan manzil qabul qilish" onChange={toggle} />}
          </div>
          {!data ? <div className="skeleton mt-3 h-10" /> : !bot?.connected ? (
            <p className="mt-2 text-sm text-ink-2">Avval botni Xabarlar oynasida ulang.</p>
          ) : bot.on ? (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
              <li>Botga lokatsiya (📎 → Joylashuv) yoki Yandex / Google havolasini yuboring.</li>
              <li>Keyin mijoz ismini yoki olinadigan pulni (masalan <b className="num">30000</b>) yozing.</li>
              <li><b>/reys</b> deb yozing va “Saytda reysni boshlash”ni bosing. Qolgani saytda.</li>
            </ol>
          ) : <p className="mt-2 text-sm text-ink-2">Yoqsangiz, botga yuborgan lokatsiyalaringizdan reys tuzib beradi.</p>}
        </div>
        <div className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Boshlanish joyi</div>
              <div className="text-[13px] text-ink-3">Har bir reys shu yerdan tuziladi</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setStartOpen(true)}>Oʻzgartirish</Button>
          </div>
          {!data ? <div className="skeleton mt-3 h-10" /> : data.start ? (
            <div className="mt-2 flex items-start gap-2.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <div className="font-medium text-ink">{data.start.from === 'office' ? 'Ishxona (Davomatdagi joy)' : data.start.label || 'Belgilangan joy'}</div>
                <a href={yandexPlaceUrl(data.start)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Xaritada koʻrish</a>
              </div>
            </div>
          ) : <p className="mt-2 text-sm text-ink-2">Belgilanmagan: reys birinchi manzildan boshlanadi.</p>}
        </div>
      </div>
      <StartModal open={startOpen} canReset={data?.start?.from === 'set'} onClose={() => setStartOpen(false)} onDone={() => { setStartOpen(false); reload(); }} />
    </Card>
  );
}

function StartModal({ open, canReset, onClose, onDone }: { open: boolean; canReset: boolean; onClose: () => void; onDone: () => void }) {
  const [place, setPlace] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setPlace(''); setLabel(''); setError(null); } }, [open]);
  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api('/delivery/start', { method: 'PUT', body });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Boshlanish joyi"
      description="Odatda Davomatdagi ishxona joyi olinadi. Boshqa joydan chiqsangiz, shu yerda belgilang (yoki botga /ombor yozing)."
      footer={<>
        {canReset && <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => send({ start: null })}>Ishxonaga qaytarish</Button>}
        <Button variant="ghost" onClick={onClose}>Bekor</Button>
        <Button variant="primary" loading={busy} disabled={!place.trim()} onClick={() => send({ place, label })}>Saqlash</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Xarita havolasi yoki koordinata"><Input value={place} placeholder="https://yandex.uz/maps/… yoki 41.31, 69.28" onChange={(e) => setPlace(e.target.value)} /></Field>
        <Field label="Nomi"><Input value={label} maxLength={120} placeholder="Masalan: Ombor" onChange={(e) => setLabel(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

/** Yandex Maps (the app on a phone) with a driving route from where you are now to `p`. */