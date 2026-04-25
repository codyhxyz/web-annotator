# Web Annotator

A persistent interaction layer for the web. Draw, highlight, and leave notes on any webpage — your annotations stay with the page.

## Overview

Web Annotator is a Chrome extension that gives you a personal overlay on every webpage. Toggle it with backtick (`` ` ``), pick a tool, and start annotating. Everything is stored locally in your browser — no account required.

### Tools

- **Pen** (`d`) — pressure-simulated freehand drawing (`perfect-freehand`)
- **Highlighter** (`h`) — word-boundary text highlights with a contextual menu (copy, add note, change color, delete)
- **Note** (`n`) — rich-text sticky notes (`Lexical` — bold, italic, lists, keyboard formatting)
- **Eraser** (`e`) — segment-distance proximity erase
- **Pointer** (`v`) — select and drag strokes (segment-distance hit testing)

### Features

- Annotations persist per *canonical* URL (tracking params stripped, host lowercased, trailing slash normalized — so `/article?utm=x` and `/article/` match)
- Per-URL, module-scoped undo/redo (`Cmd+Z` / `Cmd+Shift+Z`)
- Background-driven cloud sync via `chrome.alarms` — runs whether or not the overlay is open
- Plugin architecture: one-file tools registered in `tools/registry.ts`
- Storage adapter: Dexie today, offscreen-document-unified store next
- Export to Markdown, JSONL, or W3C Web Annotation format
- Import from Readwise, Kindle, and Hypothesis
- Full-text search across annotations (index-backed)
- Optional realtime presence via Cloudflare Durable Objects — unbounded backoff reconnect, token re-read on every attempt

## Project Structure

```
annotator-v2/    Chrome extension (React + Vite + Dexie)
backend/         Cloudflare Workers sync API (Hono + D1 + Durable Objects)
cli/             Local CLI companion (better-sqlite3)
old_extension/   Deprecated v1 (archived, not maintained)
```

## Getting Started

### Extension (local-only mode)

The extension works fully offline with no backend or account. Annotations are stored in IndexedDB.

```bash
cd annotator-v2
pnpm install
pnpm dev
```

Load the `dist/` directory as an unpacked extension at `chrome://extensions` (enable Developer Mode).

### With Cloud Sync (optional)

Cloud sync requires a [Cloudflare Workers](https://workers.cloudflare.com/) backend and [Clerk](https://clerk.com/) authentication. This is entirely optional — the extension is fully functional without it.

1. **Backend:**
   ```bash
   cd backend
   pnpm install
   ```
   Create a D1 database and KV namespace in your Cloudflare dashboard, then update `wrangler.toml` with your resource IDs.
   ```bash
   pnpm run db:migrate:local
   pnpm dev
   ```

2. **Clerk:** Create a Clerk application configured for Chrome extension auth. Set `CLERK_SECRET_KEY` as a Cloudflare secret (`wrangler secret put CLERK_SECRET_KEY`).

3. **Extension env:**
   ```bash
   cd annotator-v2
   cp .env.example .env
   # Set VITE_API_URL to your backend URL
   # Set VITE_CLERK_PUBLISHABLE_KEY to your Clerk key
   pnpm dev
   ```

### CLI Companion

The `ann` CLI provides local annotation management via SQLite, independent of the browser extension.

```bash
cd cli
pnpm install
pnpm build
node bin/ann.js --help
```

`ann serve` starts a local HTTP API on port 7717 for integration with Raycast, Alfred, shell scripts, and other tools.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `` ` `` | Toggle overlay |
| `d` | Pen tool |
| `h` | Highlighter |
| `n` | Note tool |
| `e` | Eraser |
| `v` | Pointer |
| `Esc` | Deselect tool |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |

## Architecture

The extension injects a content script into every page, mounting a React app inside a Shadow DOM to avoid CSS conflicts with the host page.

**Plugin model:** Tools are single-file modules exporting a `Tool` (see `tools/types.ts`) — id, label, hotkey, icon, surface (`canvas`|`dom`|`pointer`|`click`), and a `Component`. `App.tsx` iterates `tools/registry.ts`; adding a new tool is a one-line registry change.

**Storage:** `StorageAdapter` (`store/adapter.ts`) is the seam between tools and the database. The service worker owns a single Dexie instance in the extension origin; content scripts and extension pages proxy every call through `chrome.runtime.sendMessage`. Writes trigger an invalidation broadcast so subscribers re-fetch. Cross-site aggregate views (Feed, search-all, export-all) see the unified store.

**Highlight anchoring:** W3C `TextPositionSelector` as the fast path, `TextQuoteSelector` (prefix/suffix) as the resilient path, plus a SHA-256 content hash of the normalized highlighted text for offline reanchoring.

**Sync:** `chrome.alarms` in the background SW fans out `SYNC_TICK` to every tab once per minute; each tab's content script performs its own delta sync (cursor-based, last-write-wins). Sync runs regardless of overlay state.

**Realtime:** Per-page WebSocket rooms via Cloudflare Durable Objects. Reconnect is unbounded with exponential backoff + jitter (capped at 30s); auth token is re-read on every connect attempt so rotations propagate.

**External API:** `api/protocol.ts` defines a JSON-RPC envelope for external callers (CLIs, MCP servers, local web tools). `ping`, `list`, `get`, `create`, `update`, and `delete` are handled in the service worker via `chrome.runtime.onMessageExternal` against the unified store. The JSON-RPC `subscribe` shape is still not implemented for external callers; instead, whitelisted extensions can open a long-lived port named `annotator-events` (see [docs/integrations.md](docs/integrations.md)) and receive `INVALIDATION_MSG` broadcasts directly.

**Stable identity:** `manifest.json` pins a `key` field so the extension's runtime ID is the same on every machine and reinstall. Cross-extension callers (and `externally_connectable.ids` lists) can be hardcoded against that ID. The matching private key lives in `annotator-v2/.keys/extension.pem` (gitignored — DO NOT COMMIT). Regenerate with `openssl genrsa -out annotator-v2/.keys/extension.pem 2048`; recompute the public-key field and the resulting ID per the formula in [docs/integrations.md](docs/integrations.md).

## Integrations

External Chrome extensions can read and write annotations via the JSON-RPC envelope, and subscribe to changes over a long-lived port. See [**docs/integrations.md**](docs/integrations.md) for setup, including the **New Tab Workbench** integration (`~/code/claude/newtab`) which mirrors per-tab "why I have this open" notes as page-level sticky notes.

## Data Formats

Annotations can be exported as:

- **Markdown** — Human-readable with YAML frontmatter, grouped by page
- **JSONL** — Full-fidelity round-trip format with LWW merge on import
- **W3C Web Annotation** — Standards-compliant JSON-LD

## License

[ISC](LICENSE)
