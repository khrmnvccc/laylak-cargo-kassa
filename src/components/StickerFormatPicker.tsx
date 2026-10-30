import { useState } from 'react';
import { labelsNeeded, saveStickerFormat, savedStickerFormat, type StickerFormat } from '../lib/print';
import { Segmented } from './ui';

/** The sticker layout choice, remembered between prints on this device. */
export function useStickerFormat() {
  const [format, setFormat] = useState<StickerFormat>(savedStickerFormat);
  return [format, (f: StickerFormat) => { saveStickerFormat(f); setFormat(f); }] as const;
}

export function StickerFormatPicker({ value, onChange, count, className }: { value: StickerFormat; onChange: (f: StickerFormat) => void; count: number; className?: string }) {
  return (
    <div className={className}>
      <Segmented value={value} onChange={onChange} className="w-full"
        options={[{ value: 'full', label: 'Katta' }, { value: '3', label: '3 tadan' }, { value: '4', label: '4 tadan' }]} />
      <p className="mt-1.5 text-xs text-ink-3">
        {value === 'full' ? 'Har bir buyurtmaga toʻliq stiker' : `Bitta yorliqda ${value} ta QR kod, qaychi bilan qirqiladi`}
        {count > 0 && <> · <b className="text-ink num">{labelsNeeded(count, value)} ta yorliq</b></>}
      </p>
    </div>
  );
}
