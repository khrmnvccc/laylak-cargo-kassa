import { waitUntil } from '@vercel/functions';

// Work the answer does not need (Telegram messages) runs after the response is sent.
// On Vercel waitUntil keeps the function alive until it finishes; elsewhere the promise simply runs on.
const pending = new Set<Promise<unknown>>();

export function background(task: Promise<unknown>) {
  const tracked: Promise<unknown> = task
    .catch((error) => console.error('Background task failed', error))
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
  waitUntil(tracked);
}

/** Resolves once every background task started so far has finished (tests). */
export async function backgroundSettled() {
  while (pending.size) await Promise.all([...pending]);
}
