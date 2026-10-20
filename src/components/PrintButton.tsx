import { useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button, useToast } from './ui';

/** "Chop etish" button for A4 printouts; shows a spinner while report data loads. */
export function PrintButton({ run, disabled, children = 'Chop etish (A4)' }: { run: () => unknown; disabled?: boolean; children?: ReactNode }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button icon={<Printer className="size-4" />} loading={busy} disabled={disabled} onClick={async () => {
      setBusy(true);
      try {
        await run();
      } catch (e) {
        toast({ tone: 'error', title: 'Chop etib boʻlmadi', description: (e as Error).message });
      } finally {
        setBusy(false);
      }
    }}>{children}</Button>
  );
}
