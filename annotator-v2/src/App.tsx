import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CommandPalette from './components/CommandPalette';
import ContextualPanel from './components/ContextualPanel';
import OverlayCanvas from './components/OverlayCanvas';
import SearchPanel from './components/SearchPanel';
import HighlightMenu from './components/HighlightMenu';
import useUndoRedo from './hooks/useUndoRedo';
import { storage } from './store/storage';
import { getCursorForTool } from './utils/cursors';
import { currentPageKey } from './utils/normalizeUrl';
import { watchAuthState, connect, disconnect, subscribe } from './sync';
import { tools, findTool, findToolByHotkey } from './tools/registry';
import { createNoteAt } from './tools/note';
import type { ToolContext } from './tools/types';

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pageKey = currentPageKey();
  const { push } = useUndoRedo(pageKey);

  const [toolColors, setToolColors] = useState<Record<string, string>>(() => {
    const entry: Record<string, string> = {};
    for (const t of tools) if (t.defaultColor) entry[t.id] = t.defaultColor;
    return entry;
  });
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showSearch, setShowSearch] = useState(false);

  const activeTool = findTool(activeToolId);

  useEffect(() => {
    // Realtime presence is UI-bound; sync runs in the background regardless.
    if (!isActive) return;
    const unwatchAuth = watchAuthState((signedIn) => {
      if (signedIn) connect(pageKey);
      else disconnect();
    });

    // Live cross-device updates: when another client edits an annotation
    // on this page, PageRoom broadcasts an `annotation:*` message. Coalesce
    // bursts and ask the SW to run a delta sync — Dexie then drives the
    // existing invalidation broadcast which re-renders subscribers.
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribe((msg) => {
      if (msg.type !== 'annotation:create' && msg.type !== 'annotation:update' && msg.type !== 'annotation:delete') return;
      if (syncTimer) return;
      syncTimer = setTimeout(() => {
        syncTimer = null;
        chrome.runtime.sendMessage({ kind: 'sync.run' }).catch(() => {});
      }, 250);
    });

    return () => {
      unwatchAuth();
      unsubscribe();
      if (syncTimer) clearTimeout(syncTimer);
      disconnect();
    };
  }, [pageKey, isActive]);

  const toggle = useCallback(() => setIsActive(p => !p), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' ||
         (active as HTMLElement).isContentEditable)
      ) return;

      if (e.key === '`' || e.key === '~') { e.preventDefault(); toggle(); return; }

      if (!isActive) return;
      if (e.key === 'Escape') { setActiveToolId(null); e.preventDefault(); return; }

      const tool = findToolByHotkey(e.key);
      if (tool) { setActiveToolId(tool.id); e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, isActive]);

  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener('annotator-toggle', handler);
    return () => window.removeEventListener('annotator-toggle', handler);
  }, [toggle]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { annotationId } = (e as CustomEvent).detail;
      if (!annotationId) return;
      const ann = await storage.get(annotationId);
      if (!ann) return;
      const data = JSON.parse(ann.data);
      if (ann.type === 'note') {
        window.scrollTo({ top: data.y - 100, behavior: 'smooth' });
      } else if (ann.type === 'highlight') {
        const { deserializeRange } = await import('./utils/rangeSerializer');
        const range = deserializeRange(data.serializedRange);
        if (range) {
          const rect = range.getBoundingClientRect();
          window.scrollTo({ top: rect.top + window.scrollY - 100, behavior: 'smooth' });
          const mark = document.querySelector(`[data-annotator-highlight-id="${annotationId}"]`);
          if (mark) {
            (mark as HTMLElement).style.outline = '2px solid #3b82f6';
            setTimeout(() => { (mark as HTMLElement).style.outline = ''; }, 2000);
          }
        }
      } else if (ann.type === 'stroke' && data.points?.length > 0) {
        const minY = Math.min(...data.points.map((p: { y: number }) => p.y));
        window.scrollTo({ top: minY - 100, behavior: 'smooth' });
      }
    };
    window.addEventListener('annotator-scroll-to', handler);
    return () => window.removeEventListener('annotator-scroll-to', handler);
  }, []);

  const currentColor = activeTool?.takesColor
    ? toolColors[activeTool.id] ?? activeTool.defaultColor ?? '#ef4444'
    : '#ef4444';

  const ctxFor = useCallback(
    (toolId: string): ToolContext => ({
      active: activeToolId === toolId,
      overlayActive: isActive,
      pageKey,
      color: toolColors[toolId] ?? findTool(toolId)?.defaultColor ?? '#ef4444',
      strokeWidth,
      canvasRef,
      storage,
      push,
      setActiveTool: setActiveToolId,
    }),
    [activeToolId, isActive, pageKey, toolColors, strokeWidth, push],
  );

  const handleContainerClick = async (e: React.MouseEvent) => {
    if (!isActive || !activeTool) return;
    if (activeTool.surface === 'click' && activeTool.id === 'note') {
      await createNoteAt(ctxFor('note'), e.clientX, e.clientY);
      setActiveToolId('pointer');
    }
  };

  const cursorOptions = activeTool?.takesColor ? { color: currentColor } : undefined;
  const containerCursor = isActive && activeTool
    ? getCursorForTool(activeTool.id, cursorOptions) : 'default';

  useEffect(() => {
    if (!isActive || !activeTool) {
      document.documentElement.style.cursor = '';
      return;
    }
    document.documentElement.style.cursor = getCursorForTool(activeTool.id, cursorOptions);
    return () => { document.documentElement.style.cursor = ''; };
  }, [isActive, activeTool, cursorOptions]);

  const canvasPointerEvents = isActive && activeTool?.surface === 'canvas' ? 'auto' : 'none';
  const containerPointerEvents =
    isActive && activeTool?.surface === 'click' ? 'pointer-events-auto' : 'pointer-events-none';

  // Stable ctx objects keyed on tool id — memo prevents child re-subscriptions.
  const toolContexts = useMemo(
    () => new Map(tools.map(t => [t.id, ctxFor(t.id)])),
    [ctxFor],
  );

  return (
    <div
      className={`relative w-full h-full ${containerPointerEvents}`}
      style={{ cursor: containerCursor }}
      onClick={handleContainerClick}
    >
      <OverlayCanvas
        ref={canvasRef}
        isActive={isActive}
        pointerEvents={canvasPointerEvents}
        cursor={containerCursor}
      />

      {tools.map(t => {
        const ctx = toolContexts.get(t.id)!;
        return <t.Component key={t.id} ctx={ctx} />;
      })}

      {isActive && activeTool && (activeTool.takesColor || activeTool.takesStrokeWidth) && (
        <ContextualPanel
          activeTool={activeTool}
          color={currentColor}
          onColorChange={(c) => setToolColors(prev => ({ ...prev, [activeTool.id]: c }))}
          strokeWidth={strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
        />
      )}

      {isActive && (
        <CommandPalette
          activeToolId={activeToolId}
          onSelectTool={setActiveToolId}
          onClose={() => setIsActive(false)}
          onUndoableAction={push}
          onSearchOpen={() => setShowSearch(true)}
        />
      )}

      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}

      <HighlightMenu onUndoableAction={push} />
    </div>
  );
}
