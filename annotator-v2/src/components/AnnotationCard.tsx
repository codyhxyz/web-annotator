import { useState, useRef, useCallback } from 'react';
import { type Annotation, type PrivacyLevel, getNoteData } from '../store/annotation';
import { storage } from '../store/storage';
import { deleteAnnotation, updateAnnotation } from '../store/undoable';
import { Pin, PinOff } from 'lucide-react';
import PrivacyToggle from './PrivacyToggle';
import NoteEditor from './NoteEditor';
import type { UndoAction } from '../hooks/useUndoRedo';

interface Props {
  annotation: Annotation;
  onUndoableAction?: (action: UndoAction) => void;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 80;

export default function AnnotationCard({ annotation, onUndoableAction }: Props) {
  const noteData = getNoteData(annotation);
  const isHandoff = !!noteData.handoff;
  const handoffAutoCenter = isHandoff && !noteData.handoffMoved;
  const [position, setPosition] = useState({ x: noteData.x, y: noteData.y });
  const [size, setSize] = useState({ width: noteData.width || 250, height: noteData.height || 120 });
  const [isFocused, setIsFocused] = useState(false);
  // Handoff bars render in viewport space (position: fixed) just like
  // hand-pinned notes — the existing `pinned` rendering branch already
  // does what we want, so we piggyback on it.
  const [pinned, setPinned] = useState(!!noteData.pinned || isHandoff);
  const [privacy, setPrivacy] = useState<PrivacyLevel>(annotation.privacy || 'private');
  const latestRef = useRef({ text: noteData.text, lexicalState: noteData.lexicalState });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef({ text: noteData.text, lexicalState: noteData.lexicalState });

  const updateData = useCallback((patch: Record<string, unknown>) => {
    const current = getNoteData(annotation);
    const updated = { ...current, ...patch };
    storage.update(annotation.id, {
      data: JSON.stringify(updated),
      syncStatus: 'pending',
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }, [annotation]);

  const handleEditorChange = useCallback((lexicalState: string, text: string) => {
    latestRef.current = { text, lexicalState };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (latestRef.current.text !== savedRef.current.text ||
          latestRef.current.lexicalState !== savedRef.current.lexicalState) {
        updateData(latestRef.current);
        savedRef.current = { ...latestRef.current };
      }
    }, 500);
  }, [updateData]);

  const handleTogglePin = useCallback(() => {
    const wasPinned = pinned;
    const newPinned = !wasPinned;

    if (newPinned) {
      const viewportX = position.x - window.scrollX;
      const viewportY = position.y - window.scrollY;
      setPosition({ x: viewportX, y: viewportY });
      setPinned(true);
      updateData({ pinned: true, x: viewportX, y: viewportY });
      onUndoableAction?.({
        undo: async () => {
          const pageX = viewportX + window.scrollX;
          const pageY = viewportY + window.scrollY;
          const current = getNoteData(annotation);
          storage.update(annotation.id, { data: JSON.stringify({ ...current, pinned: false, x: pageX, y: pageY }) });
        },
        redo: async () => {
          const current = getNoteData(annotation);
          storage.update(annotation.id, { data: JSON.stringify({ ...current, pinned: true, x: viewportX, y: viewportY }) });
        },
      });
    } else {
      const pageX = position.x + window.scrollX;
      const pageY = position.y + window.scrollY;
      setPosition({ x: pageX, y: pageY });
      setPinned(false);
      updateData({ pinned: false, x: pageX, y: pageY });
      onUndoableAction?.({
        undo: async () => {
          const vpX = pageX - window.scrollX;
          const vpY = pageY - window.scrollY;
          const current = getNoteData(annotation);
          storage.update(annotation.id, { data: JSON.stringify({ ...current, pinned: true, x: vpX, y: vpY }) });
        },
        redo: async () => {
          const current = getNoteData(annotation);
          storage.update(annotation.id, { data: JSON.stringify({ ...current, pinned: false, x: pageX, y: pageY }) });
        },
      });
    }
  }, [pinned, position, annotation, onUndoableAction, updateData]);

  const cardRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    // For an unmoved handoff bar, position.x/y are sentinel zeros — read
    // the actual pixel-perfect viewport rect from the DOM so the first
    // drag doesn't snap the bar to (0,0).
    let startX = position.x;
    let startY = position.y;
    if (handoffAutoCenter && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      startX = rect.left;
      startY = rect.top;
      setPosition({ x: startX, y: startY });
    }

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      setPosition({ x: startX + dx, y: startY + dy });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      setPosition(current => {
        const moved = current.x !== startX || current.y !== startY;
        const promoteHandoff = handoffAutoCenter; // first drag flips to manual
        if (moved || promoteHandoff) {
          const patch: Record<string, unknown> = { x: current.x, y: current.y };
          if (promoteHandoff) patch.handoffMoved = true;
          updateData(patch);
          onUndoableAction?.({
            undo: async () => {
              const u: Record<string, unknown> = { x: startX, y: startY };
              if (promoteHandoff) u.handoffMoved = false;
              updateData(u);
            },
            redo: async () => {
              const r: Record<string, unknown> = { x: current.x, y: current.y };
              if (promoteHandoff) r.handoffMoved = true;
              updateData(r);
            },
          });
        }
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [position, annotation.id, onUndoableAction, updateData, handoffAutoCenter]);

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let newW = startW;
      let newH = startH;

      if (corner.includes('r')) newW = Math.max(MIN_WIDTH, startW + dx);
      if (corner.includes('b')) newH = Math.max(MIN_HEIGHT, startH + dy);
      if (corner.includes('l')) newW = Math.max(MIN_WIDTH, startW - dx);

      setSize({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      setSize(current => {
        updateData({ width: current.width, height: current.height });
        onUndoableAction?.({
          undo: async () => { updateData({ width: startW, height: startH }); },
          redo: async () => { updateData({ width: current.width, height: current.height }); },
        });
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [size, annotation.id, onUndoableAction, updateData]);

  // Default position for an unmoved handoff bar: hug the bottom edge of
  // the viewport, horizontally centered. Once the user drags it the
  // `handoffMoved` flag flips and we fall through to explicit x/y.
  const baseStyle = {
    width: size.width,
    maxWidth: isHandoff ? 'calc(100vw - 32px)' : undefined,
    height: size.height,
    backgroundColor: annotation.color || '#fef08a',
    pointerEvents: 'auto' as const,
  };
  const positionStyle = handoffAutoCenter
    ? {
        position: 'fixed' as const,
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 10000,
      }
    : {
        position: pinned ? ('fixed' as const) : ('absolute' as const),
        left: position.x,
        top: position.y,
        zIndex: pinned ? 10000 : 10,
      };

  return (
    <div
      ref={cardRef}
      className={`shadow-lg rounded-xl overflow-hidden backdrop-blur-md border transition-shadow group ${
        isFocused ? 'ring-2 ring-blue-500 border-blue-200' : 'border-slate-200/50 hover:border-slate-300'
      }`}
      style={{ ...baseStyle, ...positionStyle }}
    >
      {/* Drag handle with pin + privacy buttons */}
      <div
        onMouseDown={handleDragStart}
        className="h-5 w-full cursor-grab active:cursor-grabbing bg-black/5 hover:bg-black/10 transition-colors flex items-center px-1"
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleTogglePin}
          className="flex items-center justify-center w-4 h-4 rounded-sm opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity cursor-pointer"
          style={{ opacity: pinned ? 0.7 : undefined }}
          title={pinned ? 'Unpin from viewport' : 'Pin to viewport'}
        >
          {pinned ? (
            <PinOff size={11} strokeWidth={2} />
          ) : (
            <Pin size={11} strokeWidth={2} />
          )}
        </button>
        <div className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ml-auto mr-5">
          <PrivacyToggle
            compact
            value={privacy}
            onChange={async (level) => {
              setPrivacy(level);
              const action = await updateAnnotation(annotation.id, { privacy: level });
              onUndoableAction?.(action);
            }}
          />
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={async () => {
          const action = await deleteAnnotation(annotation.id);
          onUndoableAction?.(action);
        }}
        className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded-bl-md bg-black/0 hover:bg-black/20 text-slate-800 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer z-10"
        title="Delete note"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>

      {/* Editor */}
      <div className="p-3 overflow-auto" style={{ height: `calc(100% - 20px)` }}>
        <NoteEditor
          initialState={noteData.lexicalState}
          initialText={noteData.text}
          onChange={handleEditorChange}
          autoFocus={!noteData.text && !noteData.lexicalState}
          onFocus={() => { setIsFocused(true); }}
          onBlur={() => { setIsFocused(false); }}
        />
      </div>

      {/* Resize handles */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'r')}
        style={{ position: 'absolute', top: 8, right: 0, bottom: 8, width: 6, cursor: 'ew-resize' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'b')}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 6, cursor: 'ns-resize' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'br')}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, cursor: 'nwse-resize' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.3 }}>
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
