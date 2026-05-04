# Web Annotator v2

**Status:** In production. Working through the "killer Chrome extension" review.
**Framework:** React + Vite + Dexie + Lexical. (Antigravity evaluated, declined — too opinionated for the permissive plugin model we want.)

---

## What This Is

A personal **interaction layer for the web** — a persistent, always-available overlay that lets you draw on, annotate, and leave notes on any webpage. Think of it as your own private HUD on top of the internet.

This isn't just an annotation tool. It's the seed of a personal web dashboard. Build it right, keep it extensible, and let it grow into whatever it needs to become.

---

## Core Tools (v2 Launch)

### Drawing Tool
- Freehand drawing on any webpage
- Color picker with sensible defaults and recent colors
- Adjustable brush size
- Smooth, pressure-friendly strokes

### Note Tool
- Place sticky notes anywhere on a page
- Rich text editing — bold, italic, lists at minimum
- Resizable and draggable
- Keyboard shortcuts for power users (Cmd+N to create, Escape to close, Tab to cycle, etc.)
- Polished small details — the kind of attention you notice in tools like Notion or Linear

### Highlighter Tool
- Select and highlight text on any page
- Multiple highlight colors
- Click a highlight to add a note to it

### Eraser Tool
- Remove individual strokes or annotations
- Area-based erasing for drawings
- Clear-all with confirmation

### Page Chatbox *(backlog — see "Deferred" below)*
- Public comment thread anchored to every page
- See what others have said, leave your own response
- Lightweight — think Reddit comments meets browser-native, not Disqus

---

## Interaction Design

### Toggle: Backtick (`` ` ``)
The backtick key shows/hides the entire annotation layer. One tap, in or out. No clicking toolbar icons to activate — the layer is either there or it isn't.

---

## Non-Negotiable Requirements

### Persistent Storage
Everything you leave on a page **stays there**. Come back in a week, a month — your annotations are waiting. Storage should be robust, backed up, and keyed to page identity intelligently (handle URL variations, anchors, query params).

### Modern UI
No janky popups or 2012-era Chrome extension aesthetics. This should feel like a native, well-designed app that happens to live in the browser. Clean typography, smooth animations, thoughtful spacing, dark/light mode.

### Performance
Zero perceptible impact on page load. Lazy-load everything. Never block the main thread. The overlay should feel like it's part of the browser, not fighting it.

### AI-Friendly API
Expose a well-documented API so that AI tools (Claude, agents, MCP servers, etc.) can programmatically create, read, and manage annotations using the same underlying storage and rendering. An AI assistant should be able to leave a note on a page for you just as easily as you can. This also means the data format needs to be clean and stable — no internal-only hacks.

---

## Future Directions

This is a living tool. Some things it might become:

- **Bookmarking / collections** — save annotated pages, organize them
- **Screenshot + annotation** — capture a region, mark it up, share it
- **Page-level notes** — a sidebar journal for any URL
- **Search across annotations** — find that note you left somewhere
- **Sync across devices** — cloud storage backend
- **AI integration** — summarize highlights, expand notes, ask questions about the page
- **Custom widgets** — clock, todo list, quick links — a true personal web dashboard
- **Collaboration** — share annotations with others (way down the road)

- **Page Restyler** *(lower priority)* — a button that lets you modify a page's appearance via natural language. "Make this dark mode." "Increase font size." "Hide the sidebar." Works by generating and injecting CSS overrides. The simplest version of: experience any page the way *you* want it. Persistent per-page, so your restylings stick.

Don't overdesign for these now. Just don't paint yourself into a corner.

---

## Architecture Principles

1. **Plugin architecture** — each tool is a self-contained module. Adding a new tool is a single file + one line in `tools/registry.ts`. See `tools/types.ts` for the contract.
2. **Storage abstraction** — `StorageAdapter` (`store/adapter.ts`) is the seam; tools never import `db` directly. The default adapter is Dexie; a messaging adapter for the offscreen-document migration is pending.
3. **Minimal permissions** — `storage`, `alarms`, `host_permissions: <all_urls>`. No `tabs`, no `scripting`, no `activeTab`.
4. **Framework-light** — React + Dexie + Lexical. No state library, no router, no CSS framework beyond Tailwind for extension UI.
5. **Type-safe throughout** — TypeScript strict + `noUncheckedIndexedAccess`. No `any`.

---

## Deferred

Tracked, not abandoned.

- **Page Chatbox** — public comment thread per page. Needs a `comments` annotation type, thread/vote data model, backend endpoints. Out of scope for the current pass.
- **CLI bridge** — POST annotations to `ann serve` on localhost:7717. External API handler now ships in the service worker; the CLI-side shim that forwards HTTP → `chrome.runtime.sendMessage` is next.
- **External `annotator:subscribe`** — other verbs ship today; subscribe needs a port-based protocol. Callers can poll `annotator:list` in the meantime.

---

*Last updated: 2026-04-16 — post architectural pass.*
