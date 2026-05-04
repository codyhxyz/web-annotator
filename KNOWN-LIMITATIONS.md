# Known Limitations

_(Nothing critical. Open items are minor or well-scoped.)_

## Cross-origin storage — **fixed**

The previous limitation (content scripts opening per-host IndexedDB
databases, so Feed and search-all saw only the current site) is
resolved. The service worker now owns a single Dexie instance in the
extension origin. Content scripts, Feed, and Auth pages proxy every
read/write through `chrome.runtime.sendMessage`; the SW broadcasts an
invalidation event after writes so subscribers re-fetch.

Legacy host-origin databases written by older builds are migrated on
first content-script load (`store/legacyMigration.ts`) and then torn
down via `Dexie.delete('WebAnnotatorDB')`.

## External API — `subscribe` not yet wired

`annotator:ping`, `list`, `get`, `create`, `update`, `delete` work
today via `chrome.runtime.onMessageExternal`. `annotator:subscribe`
returns `not-yet-implemented` — persistent-port semantics via
`externally_connectable` need more thought (per-caller port lifecycle,
origin allowlisting for the subscriber, etc.). External callers can
poll `annotator:list` in the meantime.

## CLI bridge — partial (CLI → extension only)

The CLI→extension direction ships via the Handoff pending-notes queue:
`ann serve` on `localhost:7717` accepts notes for a URL, the SW polls
`/pending-notes` on page load (`background.ts handleHandoffCheck` →
`handoff/drainPendingNotes.ts`), and the content script renders them as
viewport bars.

The reverse direction — extension mutations streamed back to the CLI's
JSONL store — is not yet wired. The external API handler in
`background.ts` exposes the verbs an `ann watch` client would need; a
thin shim inside the CLI can forward HTTP → `chrome.runtime.sendMessage`
via an intermediary tab. Not shipped in this pass.
