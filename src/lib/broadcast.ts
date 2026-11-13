// Ommaviy xabarlar: shared by the server (to check) and the editor (to count and preview).
export interface BroadcastButton { text: string; url: string }
export const BROADCAST_MAX_TEXT = 3500;
export const BROADCAST_MAX_BUTTONS = 2;

export interface Broadcast {
  id: string; title: string; text: string; buttons: BroadcastButton[]; audience: { all?: boolean; users?: string[] };
  silent: boolean; send_at: string | null; status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  delivered: number; failed: number; created_by_name: string | null; created_at: string; sent_at: string | null;
}
