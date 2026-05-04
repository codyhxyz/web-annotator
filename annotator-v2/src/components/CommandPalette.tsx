import { useRef, useEffect } from "react";
import { Trash2, Search, Download, Upload, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clearAll } from "../store/undoable";
import { currentPageKey } from "../utils/normalizeUrl";
import { exportAndDownload } from "../utils/exportAnnotations";
import { importJsonl, importReadwiseCsv, importKindleClippings, importHypothesisJson } from "../utils/importers";
import { tools } from "../tools/registry";
import PresenceIndicator from "./PresenceIndicator";
import AuthButton from "./AuthButton";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  activeToolId: string | null;
  onSelectTool: (tool: string | null) => void;
  onClose: () => void;
  onUndoableAction?: (action: UndoAction) => void;
  onSearchOpen?: () => void;
}

export default function CommandPalette({ activeToolId, onSelectTool, onClose, onUndoableAction, onSearchOpen }: Props) {
  const posRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Direct DOM positioning — no React state, zero lag
  useEffect(() => {
    const el = posRef.current;
    if (!el) return;

    const update = () => {
      el.style.top = `${window.scrollY + window.innerHeight - 80}px`;
    };
    update();

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const currentUrl = currentPageKey();

  const handleExportAll = async () => {
    try {
      await exportAndDownload();
    } catch (e) {
      console.error("Failed to export annotations", e);
    }
  };

  const handleExportPage = async () => {
    try {
      await exportAndDownload({ url: currentUrl });
    } catch (e) {
      console.error("Failed to export page annotations", e);
    }
  };

  /**
   * Route an imported file to the right parser. We sniff format in this
   * order: extension first (cheap, unambiguous for .csv / .jsonl); for
   * `.txt` we trust Kindle's `==========` separator; for `.json` we peek
   * at the first row to distinguish Hypothesis (`uri`/`target`) from our
   * own JSONL fallback.
   */
  const handleImportFile = async (file: File) => {
    try {
      const content = await file.text();
      const name = file.name.toLowerCase();

      let result: { imported: number; skipped?: number };
      if (name.endsWith('.csv')) {
        result = await importReadwiseCsv(content);
      } else if (name.endsWith('.jsonl')) {
        result = await importJsonl(content);
      } else if (name.endsWith('.txt')) {
        result = await importKindleClippings(content);
      } else if (name.endsWith('.json')) {
        result = await importHypothesisJson(content);
      } else {
        // Unknown extension — try JSONL (our own format), then fall back.
        try { result = await importJsonl(content); }
        catch { result = await importHypothesisJson(content); }
      }

      const skipped = result.skipped ? ` (${result.skipped} skipped)` : '';
      window.alert(`Imported ${result.imported} annotations${skipped}.`);
    } catch (e) {
      console.error('Import failed', e);
      window.alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm("Clear all annotations on this page?")) {
      try {
        const action = await clearAll(currentUrl);
        onUndoableAction?.(action);
        onSelectTool('pointer');
        onClose();
      } catch (e) {
        console.error("Failed to clear annotations", e);
      }
    }
  };

  return (
    <div
      ref={posRef}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence>
        <motion.div
          drag
          dragMomentum={false}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
          className="flex items-center p-2 gap-2 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-full text-slate-800"
          style={{ cursor: 'default' }}
        >
          <div className="flex items-center gap-1 pr-4 border-r border-slate-200/50 cursor-grab active:cursor-grabbing">
            {tools.map((t) => {
              const Icon = t.icon;
              const isActive = activeToolId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTool(isActive ? null : t.id)}
                  className={`p-3 rounded-full transition-all duration-200 ${
                    isActive
                      ? "bg-blue-500 text-white shadow-md scale-105"
                      : "hover:bg-slate-100/50 text-slate-600 hover:text-slate-900 hover:scale-105"
                  }`}
                  title={`${t.label} (${t.hotkey})`}
                >
                  <Icon size={20} className={isActive ? "stroke-[2.5px]" : "stroke-2"} />
                </button>
              );
            })}
          </div>
          <PresenceIndicator />
          <div className="flex items-center gap-1 pl-2">
            <button
              onClick={() => onSearchOpen?.()}
              className="p-3 rounded-full text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 transition-all duration-200 hover:scale-105"
              title="Search Annotations"
            >
              <Search size={20} className="stroke-2" />
            </button>
<button
              onClick={() => chrome.runtime.sendMessage({ type: "OPEN_FEED" })}
              className="p-3 rounded-full text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 transition-all duration-200 hover:scale-105"
              title="All Annotations"
            >
              <Layers size={20} className="stroke-2" />
            </button>
            <button
              onClick={handleExportAll}
              onContextMenu={(e) => { e.preventDefault(); handleExportPage(); }}
              className="p-3 rounded-full text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 transition-all duration-200 hover:scale-105"
              title="Export All (right-click for this page only)"
            >
              <Download size={20} className="stroke-2" />
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="p-3 rounded-full text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 transition-all duration-200 hover:scale-105"
              title="Import (Readwise .csv, Kindle My Clippings .txt, Hypothesis .json, JSONL backup)"
            >
              <Upload size={20} className="stroke-2" />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.txt,.json,.jsonl"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = ''; // allow re-importing the same file
              }}
            />
            <button
              onClick={handleClearAll}
              className="p-3 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 hover:scale-105"
              title="Clear All"
            >
              <Trash2 size={20} />
            </button>
            <AuthButton />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
