/**
 * Handoff: on page load, drain the localhost pending-notes queue for the
 * current URL and surface them as a single bottom-of-viewport bar.
 *
 * - There is at most ONE handoff bar per page. If a previous handoff
 *   annotation already exists for this URL it is deleted first; if the
 *   queue contains multiple pending notes they are joined into one bar.
 * - The bar renders pinned to the viewport (position: fixed) by
 *   AnnotationCard's handoff branch — default position is bottom-center,
 *   draggable, and persists once the user moves it.
 * - Goes through the normal `addAnnotation` path so Dexie, sync, and
 *   invalidation broadcasts are handled uniformly.
 * - Deletes each drained entry from the queue so it does not re-create
 *   on reload.
 */

import { addAnnotation } from '../store/undoable';
import { storage } from '../store/storage';
import { getNoteData } from '../store/annotation';
import { getPageContext } from '../utils/pageContext';
import type { HandoffResponse } from '../store/messageProtocol';

const BAR_WIDTH = 720;
const BAR_HEIGHT = 80;
const HANDOFF_COLOR = '#c7d2fe';
const HANDOFF_TAG = 'claude-task';

export async function drainPendingNotes(pageKey: string): Promise<number> {
  const url = window.location.href;
  const resp = await chrome.runtime.sendMessage({ kind: 'handoff.check', url }) as HandoffResponse;
  if (!resp || !resp.ok || resp.notes.length === 0) return 0;

  // Enforce single-bar invariant: drop any existing handoff bar on this
  // page before materializing the new batch.
  const existing = await storage.list({ url: pageKey, type: 'note' });
  for (const ann of existing) {
    try {
      if (getNoteData(ann).handoff) await storage.delete(ann.id);
    } catch { /* malformed data — skip */ }
  }

  const text = resp.notes.map(n => n.text).join('\n\n');
  const color = resp.notes[0]?.color ?? HANDOFF_COLOR;
  const tags = resp.notes[0]?.tags ?? [HANDOFF_TAG];
  const ctx = getPageContext(window.scrollY);

  await addAnnotation({
    id: crypto.randomUUID(),
    url: pageKey,
    type: 'note',
    data: JSON.stringify({
      text,
      x: 0,
      y: 0,
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      handoff: true,
    }),
    color,
    timestamp: Date.now(),
    tags,
    ...ctx,
  });

  for (const note of resp.notes) deletePendingQuietly(note.id);
  return resp.notes.length;
}

function deletePendingQuietly(id: string): void {
  fetch(`http://localhost:7717/pending-notes/${id}`, { method: 'DELETE' }).catch(() => {});
}
