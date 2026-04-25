/**
 * Service worker — owns the unified Dexie instance and drives sync.
 *
 * MV3 SWs have IndexedDB; no offscreen document is required. Every
 * storage request from content scripts, Feed, or Auth pages round-
 * trips here and is served by swStorage (dexieAdapter on one extension-
 * origin database).
 *
 * Wake-up cost: Dexie reopens in ~50ms when the SW is re-instantiated.
 * Sync is idempotent so repeated wakes don't double-push.
 */

import { swStorage } from './store/swStorage';
import { performSync } from './sync/engine';
import { watchAuthState } from './sync/auth';
import type { Annotation } from './store/annotation';
import type { AnnotationFilter } from './store/adapter';
import type {
  ClientRequest, StorageResponse, StorageOp, InvalidationEvent,
} from './store/messageProtocol';
import { INVALIDATION_MSG } from './store/messageProtocol';
import type { ApiRequest, ApiResponse } from './api/protocol';

// ── Auth token mirror (sync needs it) ────────────────────────────────
let authed = false;
watchAuthState(s => { authed = s; });

// ── Alarms: periodic sync ────────────────────────────────────────────
const SYNC_ALARM = 'annotator-sync';
const SYNC_PERIOD_MINUTES = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_ALARM || !authed) return;
  try { await performSync(); }
  catch (err) { console.warn('[sw] sync failed', err); }
});

// ── chrome.action toggle ────────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
});

// ── Client storage / sync message router ────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const req = msg as ClientRequest | { type: string };

  if ('kind' in req && req.kind === 'storage') {
    handleStorage(req).then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: String(err?.message ?? err) });
    });
    return true;
  }

  if ('kind' in req && req.kind === 'sync.run') {
    performSync()
      .then(r => sendResponse({ ok: true, data: r }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }

  if ('kind' in req && req.kind === 'handoff.check') {
    handleHandoffCheck(req.url)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }

  if ('type' in req) {
    if (req.type === 'OPEN_FEED') {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/feed/index.html') });
    }
    if (req.type === 'OPEN_AUTH') {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/auth/index.html') });
    }
    if (req.type === 'NAVIGATE_TO_ANNOTATION') {
      handleNavigateToAnnotation(req as { type: string; url?: string; annotationId?: string });
    }
  }
  return undefined;
});

async function handleStorage(msg: { kind: 'storage' } & StorageOp): Promise<StorageResponse> {
  switch (msg.op) {
    case 'get': {
      const data = await swStorage.get(msg.id);
      return { ok: true, data };
    }
    case 'bulkGet': {
      const data = await swStorage.bulkGet(msg.ids);
      return { ok: true, data };
    }
    case 'list': {
      const data = await swStorage.list(msg.filter);
      return { ok: true, data };
    }
    case 'put': {
      await swStorage.put(msg.ann);
      broadcastChanged({ url: msg.ann.url, type: msg.ann.type });
      return { ok: true };
    }
    case 'bulkPut': {
      await swStorage.bulkPut(msg.list);
      broadcastChanged();
      return { ok: true };
    }
    case 'update': {
      await swStorage.update(msg.id, msg.changes);
      broadcastChanged();
      return { ok: true };
    }
    case 'delete': {
      await swStorage.delete(msg.id);
      broadcastChanged();
      return { ok: true };
    }
    case 'bulkDelete': {
      await swStorage.bulkDelete(msg.ids);
      broadcastChanged();
      return { ok: true };
    }
    case 'deleteWhere': {
      const deleted = await swStorage.deleteWhere(msg.filter);
      broadcastChanged(msg.filter);
      return { ok: true, data: deleted };
    }
  }
}

// ── Handoff: proxy localhost pending-notes queue ─────────────────────
// SW is a dumb proxy. Viewport-dependent positioning happens in the
// content script, which owns window geometry.
async function handleHandoffCheck(url: string): Promise<{ ok: true; notes: unknown[] }> {
  try {
    const r = await fetch(`http://localhost:7717/pending-notes?url=${encodeURIComponent(url)}`);
    if (!r.ok) return { ok: true, notes: [] };
    const body = await r.json() as { notes: unknown[] };
    return { ok: true, notes: body.notes };
  } catch {
    // Bridge daemon not running — graceful no-op.
    return { ok: true, notes: [] };
  }
}

// External subscribers — long-lived ports opened by other extensions
// that have been whitelisted in `externally_connectable.ids` and want
// to receive invalidation events. See `chrome.runtime.onConnectExternal`
// listener below.
const externalSubscribers = new Set<chrome.runtime.Port>();

function broadcastChanged(affected?: AnnotationFilter) {
  const msg: InvalidationEvent = { type: INVALIDATION_MSG, affected };
  // Extension pages (Feed, Auth) hear runtime broadcasts.
  chrome.runtime.sendMessage(msg).catch(() => {});
  // Content scripts only hear tabs.sendMessage.
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
  // External subscribers (other extensions). Best-effort — a dropped
  // port will throw, which we swallow; the disconnect listener below
  // is the source of truth for membership.
  for (const port of externalSubscribers) {
    try { port.postMessage(msg); } catch { /* port already torn down */ }
  }
}

// ── External subscription port ──────────────────────────────────────
// Whitelisted external extensions can open a long-lived port named
// `annotator-events` to receive INVALIDATION_MSG broadcasts. This is
// the runtime equivalent of the deferred `annotator:subscribe` JSON-RPC
// call — kept out of `protocol.ts` because port wiring isn't a request/
// response shape and shouldn't pretend to be.
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'annotator-events') {
    port.disconnect();
    return;
  }
  externalSubscribers.add(port);
  port.onDisconnect.addListener(() => {
    externalSubscribers.delete(port);
  });
});

// ── ann:// navigation handler (unchanged semantics) ─────────────────
function handleNavigateToAnnotation(msg: { url?: string; annotationId?: string }) {
  const { url, annotationId } = msg;
  if (!url || !annotationId) return;
  chrome.tabs.create({ url }, (tab) => {
    if (!tab?.id) return;
    const tabId = tab.id;
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_ANNOTATION', annotationId }).catch(() => {});
        }, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── External JSON-RPC API ──────────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  handleExternalApi(msg as ApiRequest)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});

async function handleExternalApi(msg: ApiRequest): Promise<ApiResponse> {
  switch (msg.type) {
    case 'annotator:ping':
      return { ok: true, type: 'pong' };
    case 'annotator:list': {
      const annotations = await swStorage.list(msg.filter);
      return { ok: true, type: 'list', annotations };
    }
    case 'annotator:get': {
      const annotation = (await swStorage.get(msg.id)) ?? null;
      return { ok: true, type: 'annotation', annotation };
    }
    case 'annotator:create': {
      const full: Annotation = {
        ...msg.annotation,
        syncStatus: 'pending',
        updatedAt: Math.floor(Date.now() / 1000),
      };
      await swStorage.put(full);
      broadcastChanged({ url: full.url, type: full.type });
      return { ok: true, type: 'created', id: full.id };
    }
    case 'annotator:update': {
      await swStorage.update(msg.id, {
        ...msg.changes,
        syncStatus: 'pending',
        updatedAt: Math.floor(Date.now() / 1000),
      });
      broadcastChanged();
      return { ok: true, type: 'updated' };
    }
    case 'annotator:delete': {
      await swStorage.delete(msg.id);
      broadcastChanged();
      return { ok: true, type: 'deleted' };
    }
    case 'annotator:subscribe':
      // Subscribe requires a persistent port; not yet supported for
      // external callers — use repeated `annotator:list` or listen to
      // the invalidation broadcast via an extension-page shim.
      return { ok: false, error: 'subscribe not yet implemented for external callers' };
  }
}
