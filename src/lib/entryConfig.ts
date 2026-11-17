// How the "Toʻlov kiritish" form behaves, set by the owner in Sozlamalar.
// Shared by the server (to check new payments) and the browser (to show the form).

export interface EntrySettings {
  /** A new payment must come with a picture of the client's orders. On by default, as before. */
  photoRequired: boolean;
}

export const DEFAULT_ENTRY: EntrySettings = { photoRequired: true };

export function cleanEntry(raw: unknown): EntrySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { photoRequired: r.photoRequired !== false };
}
