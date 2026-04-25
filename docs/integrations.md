# Integrations

External callers talk to the annotator's service worker over the JSON-RPC
envelope defined in `src/api/protocol.ts`. The wire handler lives in
`src/background.ts` (`handleExternalApi`) and routes ping/list/get/create/
update/delete against `swStorage` (the unified Dexie instance).

For change notifications, the SW also accepts long-lived external ports
named `annotator-events`, fan-outs every `INVALIDATION_MSG` to subscribed
ports, and tears them down on disconnect. This is the runtime equivalent
of a `subscribe` JSON-RPC call — kept out of `protocol.ts` because port
wiring isn't a request/response shape.

## Per-integration setup

For an external Chrome extension to talk to us, two things must be true:

1. **The annotator's manifest whitelists the caller.** Edit
   `public/manifest.json` and add the caller's runtime extension ID to
   `externally_connectable.ids`.
2. **The caller knows our runtime extension ID.** Either look it up at
   `chrome://extensions` (Developer Mode on) or — better — pin both
   sides' IDs by setting a `key` field in each `manifest.json` (see
   "Stable identity" below).

### Stable identity (recommended)

Without a `key` field, Chrome generates a fresh runtime ID for each
unpacked install. With a `key` field, the runtime ID is a deterministic
SHA-256-derived hash of the public key — same ID on every machine and
profile.

Generate, derive the manifest field, and compute the resulting ID:

```bash
# 1. Private key (DO NOT COMMIT — covered by .gitignore as `.keys/`)
openssl genrsa -out annotator-v2/.keys/extension.pem 2048

# 2. Public key in DER, base64 — this is the manifest "key" field value
openssl rsa -in annotator-v2/.keys/extension.pem -pubout -outform DER \
  2>/dev/null | base64 | tr -d '\n'

# 3. The resulting runtime extension ID
openssl rsa -in annotator-v2/.keys/extension.pem -pubout -outform DER \
  2>/dev/null | openssl dgst -sha256 -binary | head -c 16 | xxd -p \
  | tr '0-9a-f' 'a-p'
```

Paste the public-key string into `public/manifest.json` as `"key"`.
Other extensions can then hardcode the resulting ID against you with no
per-machine setup.

The annotator's pinned ID is **`gkakfegigenenalboaalalflkbdhppgh`**.

## Known integrations

### new tab, blue tab (`~/code/claude/newtab`)

Pinned ID: **`ecgffmpjfhljlfcgahmlckpajnbmpogj`**.

When the user edits a tab note in new tab, blue tab, the note is
mirrored as a sticky `note`-type annotation on the page's canonical URL,
tagged `newtab-intent`. CREATE/UPDATE/DELETE are idempotent on the newtab
side via a local `canonicalUrl → annotationId` map.

Edits made on the annotator side flow back to newtab via the
`annotator-events` port: newtab's UI keeps a long-lived port open while
mounted, refetches affected annotations on each invalidation, and writes
the new text into its `tabNotes` storage map. The newtab UI's existing
`chrome.storage.onChanged` listener picks up the write and re-renders.

Both directions are best-effort: if either extension is missing, has
the other's ID wrong, or its SW is asleep, nothing blocks. Reconnects
use exponential backoff capped at 30 seconds.

## Notes

- All external writes are tagged `syncStatus: 'pending'` and a fresh
  `updatedAt` (unix seconds) — the cloud sync engine will pick them up
  on the next tick if cloud sync is configured.
- Invalidation events sometimes arrive without a URL hint (e.g. after
  `bulkPut` or external `update`/`delete`). Subscribers should be
  prepared to do a full sweep over their tracked URLs in that case.
- Self-broadcasts: when a port-subscriber writes to the annotator, the
  resulting invalidation will fan back out to that same port. This is
  intentional — subscribers should make their reconcile idempotent
  rather than try to filter out their own writes (otherwise they'd need
  to track every in-flight request ID).
